'use server';

import { revalidatePath } from 'next/cache';

import { requireCap } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { dec } from '@/lib/db/convert';
import { activeExpenseCategoryIdSet } from '@/lib/expenses/categories';
import { guessMethod } from '@/lib/expenses/cleanup-shared';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';

// Конвертация «платёж-плюсом» → расход по делу (разовый разбор старых данных).
//
// Что происходит в одной транзакции:
//   1) создаём case_expenses с теми же суммой/датой/примечанием
//      → триггер cash_sync_on_expense кладёт РОЗХІД в кассу;
//   2) удаляем платёж
//      → payments_recalc пересчитывает cases.paid_total,
//        cases_recompute_debt пересчитывает долг и переплату,
//        приходная строка кассы уходит каскадом (FK payment_id).
//
// Следствия, о которых предупреждает UI:
//   • по счёту кассы сумма сдвинется на −2× (было ошибочно +N приходом,
//     станет −N расходом) — это и есть исправление;
//   • база ЗП уменьшается (она = paid_total), т.е. начисления по делу падают
//     до корректных. Если по делу уже ВЫПЛАЧИВАЛИ — нужна ручная сверка.

export type BatchConvertState = {
  ok: boolean;
  message?: string;
  /** Сколько записей реально переведено (для тоста «Переведено: N»). */
  converted?: number;
};

// guessMethod (способ оплаты → код счёта списания) — в cleanup-shared.ts.

// ============================================================================
// Массовый разбор: N платежей → расходы за одну операцию.
//
// Разовая чистка исторических данных: на проде таких записей ~160, поштучно их
// никто разбирать не станет. Всё идёт ОДНОЙ транзакцией — либо переводится
// весь отмеченный набор, либо не переводится ничего. Одну запись разбирают тем
// же экшеном (отметил одну галочку) — отдельного «поштучного» пути нет.
// ============================================================================
export async function convertPaymentsBatchAction(
  _prev: BatchConvertState,
  formData: FormData,
): Promise<BatchConvertState> {
  const user = await requireCap('manage_case_expenses');
  const { t } = await getT();
  if (!user.caps.delete_payments) {
    return { ok: false, message: t.errors.db.noPermission };
  }

  const category_id = String(formData.get('category_id') ?? '').trim();
  const ids = formData
    .getAll('payment_ids')
    .map((v) => String(v).trim())
    .filter((v) => UUID_RE.test(v));

  if (!UUID_RE.test(category_id)) {
    return { ok: false, message: t.expenseCleanup.errors.badInput };
  }
  if (ids.length === 0) {
    return { ok: false, message: t.expenseCleanup.errors.nothingSelected };
  }

  const activeIds = await activeExpenseCategoryIdSet();
  if (!activeIds.has(category_id)) {
    return { ok: false, message: t.expenses.errors.categoryInvalid };
  }

  let done: Array<{ payment_id: string; case_id: string; amount: number }> = [];
  try {
    done = await userDb(user.profile.id, async (tx) => {
      const pays = await tx.payments.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          case_id: true,
          amount: true,
          paid_at: true,
          method: true,
          note: true,
        },
      });

      const out: Array<{ payment_id: string; case_id: string; amount: number }> = [];
      for (const pay of pays) {
        await tx.expenses.create({
          data: {
            case_id: pay.case_id,
            category_id,
            amount: pay.amount,
            spent_at: pay.paid_at,
            method: guessMethod(pay.method, pay.note),
            note: pay.note ?? pay.method,
            created_by: user.profile.id,
          },
          select: { id: true },
        });
        const del = await tx.payments.deleteMany({ where: { id: pay.id } });
        // RLS не пустил к удалению — валим ВСЮ пачку, чтобы не остаться
        // с расходом-дублем при живом платеже.
        if (del.count === 0) throw new Error('payment_delete_denied');
        out.push({ payment_id: pay.id, case_id: pay.case_id, amount: dec(pay.amount) });
      }
      return out;
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'convertPaymentsBatchAction',
        err,
        t.expenseCleanup.errors.convertFailed,
        t.errors.db,
      ),
    };
  }

  // Журнал — по записи на каждое дело (лог вне транзакции: он вторичен и
  // не должен уметь откатить уже применённую чистку).
  for (const d of done) {
    await logActivity({
      entity_type: 'case',
      entity_id: d.case_id,
      action: 'payment_converted_to_expense',
      changes: { payment_id: d.payment_id, amount: d.amount, category_id, batch: true },
    });
  }

  const touched = new Set(done.map((d) => d.case_id));
  for (const cid of touched) revalidatePath(`/cases/${cid}`);
  revalidatePath('/settings/expense-cleanup');
  revalidatePath('/reports/cash');

  return { ok: true, converted: done.length };
}
