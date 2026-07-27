'use server';

import { revalidatePath } from 'next/cache';

import { requireCap } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { dec, toDbDate } from '@/lib/db/convert';
import { activeExpenseCategoryIdSet } from '@/lib/expenses/categories';
import { getT } from '@/lib/i18n/server';
import { isExpenseMethod } from '@/lib/types/db';
import { UUID_RE, parseAmount, isValidDate } from '@/lib/validation';

// Расходы по делу (миграция 0009). Зеркало lib/payments/actions.ts.
//
// ⚠️ Расход НЕ трогает деньги дела: paid_total/debt/overpaid считаются из
// payments, а зарплата — из paid_total. Единственный побочный эффект —
// авто-Розхід в кассе (триггер cash_sync_on_expense).

export type CreateExpenseFields =
  | 'case_id'
  | 'category_id'
  | 'amount'
  | 'spent_at'
  | 'method'
  | 'note';

export type CreateExpenseState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreateExpenseFields, string>>;
};

export async function createExpenseAction(
  _prev: CreateExpenseState,
  formData: FormData,
): Promise<CreateExpenseState> {
  const case_id = String(formData.get('case_id') ?? '').trim();
  // Расход бывает двух видов (0010): по делу и общефирменный (аренда, налоги,
  // связь). Права у них РАЗНЫЕ — так же, как в RLS-политике expenses_insert:
  // по делу — manage_case_expenses, без дела — права кассы (там же зарплата).
  // Без requireCap пользователь без права упёрся бы в silent-deny.
  const user = case_id
    ? await requireCap('manage_case_expenses')
    : await requireCap('can_manage_cash');
  const { t } = await getT();

  const category_id = String(formData.get('category_id') ?? '').trim();
  const amount_raw = String(formData.get('amount') ?? '').trim();
  const spent_at = String(formData.get('spent_at') ?? '').trim();
  const method = String(formData.get('method') ?? '').trim();
  // Конкретный счёт списания (0015). Форма показывает его тем, у кого есть
  // доступ к кассе; остальным остаётся выбор ВИДА счёта (method).
  const account_id = String(formData.get('account_id') ?? '').trim();
  const note_raw = String(formData.get('note') ?? '').trim();

  const fieldErrors: CreateExpenseState['fieldErrors'] = {};

  // Пустое дело — законный случай: расход фирмы вне дел.
  if (case_id && !UUID_RE.test(case_id))
    fieldErrors.case_id = t.expenses.errors.caseInvalid;

  if (!category_id) fieldErrors.category_id = t.expenses.errors.categoryRequired;
  else if (!UUID_RE.test(category_id))
    fieldErrors.category_id = t.expenses.errors.categoryInvalid;

  if (!amount_raw) fieldErrors.amount = t.expenses.errors.amountRequired;
  else if (parseAmount(amount_raw) === null)
    fieldErrors.amount = t.expenses.errors.amountInvalid;

  if (!spent_at) fieldErrors.spent_at = t.expenses.errors.dateRequired;
  else if (!isValidDate(spent_at))
    fieldErrors.spent_at = t.expenses.errors.dateInvalid;

  // Списание задаётся ЛИБО конкретным счётом, ЛИБО видом счёта (method) —
  // от них зависит, на какой счёт кассы ляжет Розхід.
  if (account_id) {
    if (!UUID_RE.test(account_id)) fieldErrors.method = t.expenses.errors.methodInvalid;
  } else if (!isExpenseMethod(method)) {
    fieldErrors.method = t.expenses.errors.methodInvalid;
  }

  if (note_raw.length > 500) fieldErrors.note = t.expenses.errors.noteTooLong;

  // Статья должна существовать и быть активной (скрытую заводить нельзя).
  if (!fieldErrors.category_id) {
    const activeIds = await activeExpenseCategoryIdSet();
    if (!activeIds.has(category_id))
      fieldErrors.category_id = t.expenses.errors.categoryInvalid;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  const amount = parseAmount(amount_raw)!;
  const note = note_raw === '' ? null : note_raw;

  // Серверный дедуп-гард (как у платежей): та же сумма по тому же делу от того
  // же пользователя за последние ~3 секунды = повторная отправка формы.
  const recentDup = await userDb(user.profile.id, (tx) =>
    tx.expenses.findFirst({
      where: {
        case_id: case_id || null,
        created_by: user.profile.id,
        amount,
        created_at: { gte: new Date(Date.now() - 3000) },
      },
      select: { id: true },
    }),
  );
  if (recentDup) {
    revalidateAfterExpense(case_id);
    return { ok: true };
  }

  // RLS WITH CHECK: expenses_insert требует автора, отсутствие системной связки
  // с выплатой ЗП и — по делу can_write_case + manage_case_expenses, без дела
  // can_manage_cash.
  let insertedId: string;
  try {
    const inserted = await userDb(user.profile.id, (tx) =>
      tx.expenses.create({
        data: {
          case_id: case_id || null,
          category_id,
          amount,
          spent_at: toDbDate(spent_at),
          method: account_id ? null : method,
          account_id: account_id || null,
          note,
          created_by: user.profile.id,
        },
        select: { id: true },
      }),
    );
    insertedId = inserted.id;
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'createExpenseAction',
        err,
        t.expenses.errors.saveFailed,
        t.errors.db,
      ),
    };
  }

  // Журнал: расход по делу наследует видимость дела, общефирменный уходит в
  // owner-категорию 'cash' — там же, где вся касса (в нём бывает зарплата).
  await logActivity({
    entity_type: case_id ? 'case' : 'cash',
    entity_id: case_id || insertedId,
    action: 'expense_created',
    changes: { expense_id: insertedId, amount, spent_at, method, account_id, category_id },
  });

  revalidateAfterExpense(case_id);
  return { ok: true };
}

// Расход виден в двух местах: на карточке дела (если оно указано) и в кассе
// (зеркало-Розхід + экран расходов фирмы).
function revalidateAfterExpense(caseId: string | null): void {
  if (caseId) revalidatePath(`/cases/${caseId}`);
  revalidatePath('/reports/cash');
  revalidatePath('/reports/expenses');
}

// Bare action: удаление расхода. RLS DELETE (expenses_delete): по делу —
// manage_case_expenses И (автор ИЛИ can_manage_users), без дела — can_manage_cash;
// зарплатные строки не удаляются вовсе (снимаются вместе с выплатой).
// Строка кассы уходит каскадом по FK.
export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const expense_id = String(formData.get('expense_id') ?? '').trim();
  const case_id = String(formData.get('case_id') ?? '').trim();
  const user = case_id
    ? await requireCap('manage_case_expenses')
    : await requireCap('can_manage_cash');

  if (!expense_id || !UUID_RE.test(expense_id)) return;

  // Снапшот для лога — после delete суммы уже не достать.
  const before = await userDb(user.profile.id, (tx) =>
    tx.expenses.findUnique({
      where: { id: expense_id },
      select: { amount: true, case_id: true, category_id: true },
    }),
  );

  try {
    // deleteMany — тихий no-op под RLS (0 строк), не исключение.
    await userDb(user.profile.id, (tx) =>
      tx.expenses.deleteMany({ where: { id: expense_id } }),
    );
  } catch (err) {
    console.error('deleteExpenseAction failed:', err);
    return;
  }

  // CSO #2: case_id для лога берём из БД, не из user-controlled formData.
  const trueCid =
    before?.case_id && UUID_RE.test(before.case_id) ? before.case_id : null;

  if (before) {
    await logActivity({
      entity_type: trueCid ? 'case' : 'cash',
      entity_id: trueCid ?? expense_id,
      action: 'expense_deleted',
      changes: {
        expense_id,
        amount: dec(before.amount),
        category_id: before.category_id,
      },
    });
  }
  revalidateAfterExpense(trueCid);
}
