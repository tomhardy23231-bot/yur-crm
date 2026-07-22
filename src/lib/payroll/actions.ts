'use server';

import { revalidatePath } from 'next/cache';

import { requireRole, requireCap } from '@/lib/auth/require-role';
import { logActivity, ORG_ENTITY_ID } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { toDbDate } from '@/lib/db/convert';
import { getT } from '@/lib/i18n/server';
import { CASE_CATEGORIES, type CaseCategory } from '@/lib/types/db';
import {
  getPayrollEmployeeCases,
  getPayrollEmployeeSummary,
} from '@/lib/payroll/queries';
import { UUID_RE } from '@/lib/validation';

export type PayrollRatesActionState = {
  ok: boolean;
  message?: string;
};

function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}

// Обновление ставок % по категориям. Право edit_payroll_rates (по умолчанию
// только owner; RLS payroll_rates_write_owner дублирует это на стороне БД).
// Форма шлёт по полю на каждую категорию: percent_<category>.
export async function updatePayrollRatesAction(
  _prev: PayrollRatesActionState,
  formData: FormData,
): Promise<PayrollRatesActionState> {
  const user = await requireCap('edit_payroll_rates');
  const { t, fmt } = await getT();

  // Парсит и валидирует процент из поля формы (0..100, запятая/точка).
  function parsePercent(field: string): number | { error: string } {
    const raw = formData.get(field);
    if (typeof raw !== 'string') {
      return { error: fmt(t.payroll.settings.fieldMissing, { field }) };
    }
    const n = Number(raw.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: t.payroll.settings.percentRange };
    }
    return n;
  }

  // Сначала валидируем все категории (ранний выход с сообщением), потом пишем
  // всё одной userDb-транзакцией (мульти-шаговая запись = одна обёртка на action).
  const updates: Array<{ category: CaseCategory; lawyer: number; expert: number }> = [];
  for (const category of CASE_CATEGORIES) {
    if (!isCaseCategory(category)) continue;

    const lawyer = parsePercent(`lawyer_percent_${category}`);
    if (typeof lawyer !== 'number') {
      return {
        ok: false,
        message: fmt(t.payroll.settings.lawyerError, {
          category: t.enums.caseCategory[category],
          error: lawyer.error,
        }),
      };
    }
    const expert = parsePercent(`expert_percent_${category}`);
    if (typeof expert !== 'number') {
      return {
        ok: false,
        message: fmt(t.payroll.settings.expertError, {
          category: t.enums.caseCategory[category],
          error: expert.error,
        }),
      };
    }
    updates.push({ category, lawyer, expert });
  }

  // Прежние значения — для diff'а в журнале (пишем только реально изменённое).
  let ratesDiff: Array<{
    category: string;
    lawyer_from: number;
    lawyer_to: number;
    expert_from: number;
    expert_to: number;
  }> = [];

  try {
    await userDb(user.profile.id, async (tx) => {
      const before = await tx.payroll_rates.findMany({
        select: { category: true, lawyer_percent: true, expert_percent: true },
      });
      const beforeByCat = new Map(
        before.map((r) => [
          r.category,
          { lawyer: Number(r.lawyer_percent), expert: Number(r.expert_percent) },
        ]),
      );
      for (const u of updates) {
        await tx.payroll_rates.updateMany({
          where: { category: u.category },
          data: {
            lawyer_percent: u.lawyer,
            expert_percent: u.expert,
            updated_at: new Date(),
          },
        });
      }
      ratesDiff = updates
        .filter((u) => {
          const b = beforeByCat.get(u.category);
          return b !== undefined && (b.lawyer !== u.lawyer || b.expert !== u.expert);
        })
        .map((u) => {
          const b = beforeByCat.get(u.category)!;
          return {
            category: u.category,
            lawyer_from: b.lawyer,
            lawyer_to: u.lawyer,
            expert_from: b.expert,
            expert_to: u.expert,
          };
        });
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('updatePayrollRatesAction', err, undefined, t.errors.db),
    };
  }

  if (ratesDiff.length > 0) {
    await logActivity({
      entity_type: 'org',
      entity_id: ORG_ENTITY_ID,
      action: 'payroll_rates_changed',
      changes: { rates: ratesDiff },
    });
  }

  revalidatePath('/settings/payroll');
  revalidatePath('/reports/payroll');
  return { ok: true, message: t.payroll.settings.ratesSaved };
}

// ============================================================================
// Ручные движения зарплаты (правка №1): выплата (с распределением по делам) и
// премия. Создание/удаление — только owner/admin (RLS + RPC дублируют проверку).
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PayrollMutationState = {
  ok: boolean;
  message?: string;
};

// Ревалидируем список ЗП и карточку конкретного сотрудника.
function revalidatePayroll(userId?: string): void {
  revalidatePath('/reports/payroll');
  if (userId && UUID_RE.test(userId)) {
    revalidatePath(`/reports/payroll/${userId}`);
  }
}

// Выплата сотруднику с распределением по делам. Форма шлёт:
//   user_id, occurred_on (YYYY-MM-DD), comment (опц.),
//   allocations — JSON [{case_id, role_in_case}] (отмеченные галочками дела).
// Суммы НЕ берём из формы — пересчитываем по серверной разбивке (outstanding),
// чтобы нельзя было выплатить больше заработанного / по чужим делам.
export async function createPayoutAction(
  _prev: PayrollMutationState,
  formData: FormData,
): Promise<PayrollMutationState> {
  const actor = await requireRole(['owner', 'admin']);
  const { t } = await getT();

  const userId = formData.get('user_id');
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return { ok: false, message: t.payroll.mutations.noEmployee };
  }

  const occurredOn = formData.get('occurred_on');
  if (typeof occurredOn !== 'string' || !DATE_RE.test(occurredOn)) {
    return { ok: false, message: t.payroll.mutations.badPayoutDate };
  }

  const commentRaw = formData.get('comment');
  const comment =
    typeof commentRaw === 'string' && commentRaw.trim().length > 0
      ? commentRaw.slice(0, 500)
      : null;

  // Разбираем отмеченные дела (case_id + роль). Может быть пусто, если платим
  // только премию.
  let selected: Array<{ case_id: string; role_in_case: string }>;
  try {
    const raw = formData.get('allocations');
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : [];
    selected = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { ok: false, message: t.payroll.mutations.badAllocations };
  }

  // Сколько из премий гасим этой выплатой (запрос из формы, серверно зажмём
  // в [0, остаток премий]).
  const bonusRaw = formData.get('bonus_amount');
  let bonusRequested = 0;
  if (typeof bonusRaw === 'string' && bonusRaw.trim()) {
    const n = Number(bonusRaw.replace(',', '.').trim());
    if (Number.isFinite(n) && n > 0) bonusRequested = n;
  }

  // Серверная истина: суммы по делам и остаток премий считаем здесь, не из формы.
  const [cases, summary] = await Promise.all([
    getPayrollEmployeeCases(userId),
    getPayrollEmployeeSummary(),
  ]);
  const outstandingByKey = new Map<string, number>();
  let caseAllocatedTotal = 0;
  for (const c of cases) {
    outstandingByKey.set(`${c.case_id}:${c.role_in_case}`, c.outstanding);
    caseAllocatedTotal += c.paid;
  }

  const allocations: Array<{
    case_id: string;
    role_in_case: string;
    amount: number;
  }> = [];
  for (const s of selected) {
    if (
      typeof s?.case_id !== 'string' ||
      (s.role_in_case !== 'lawyer' && s.role_in_case !== 'expert')
    ) {
      continue;
    }
    const amount = outstandingByKey.get(`${s.case_id}:${s.role_in_case}`) ?? 0;
    if (amount > 0) {
      allocations.push({
        case_id: s.case_id,
        role_in_case: s.role_in_case,
        amount: Math.round(amount * 100) / 100,
      });
    }
  }

  // Остаток премий = начислено премий − уже выплачено по премиям. Выплаченное по
  // премиям выводится как «всего выплачено − распределено по делам» (премия в
  // payout_allocations не фигурирует — её доля в сумме выплаты неявная).
  const row = summary.find((r) => r.user_id === userId);
  const bonusTotal = row?.bonus ?? 0;
  const payoutTotal = row?.payout ?? 0;
  const bonusPaid = Math.max(0, payoutTotal - caseAllocatedTotal);
  const bonusOutstanding = Math.max(0, Math.round((bonusTotal - bonusPaid) * 100) / 100);
  const bonusAmount = Math.min(bonusRequested, bonusOutstanding);

  const caseSum = allocations.reduce((s, a) => s + a.amount, 0);
  const total = Math.round((caseSum + bonusAmount) * 100) / 100;
  if (total <= 0) {
    return {
      ok: false,
      message: t.payroll.mutations.nothingSelected,
    };
  }

  // Прямые вставки (без RPC), чтобы сумма выплаты могла включать долю премии
  // сверх распределённого по делам (RPC create_payout ставит amount = Σ аллокаций).
  // Обе вставки — в ОДНОЙ userDb-транзакции: сбой аллокаций откатывает и выплату,
  // а DEFERRABLE-триггер check_payout_allocations (Σ ≤ amount) проверяется на коммите.
  try {
    await userDb(actor.profile.id, async (tx) => {
      const created = await tx.payroll_transactions.create({
        data: {
          user_id: userId,
          kind: 'payout',
          amount: total,
          comment,
          occurred_on: toDbDate(occurredOn),
          created_by: actor.profile.id,
        },
        select: { id: true },
      });
      if (allocations.length > 0) {
        await tx.payout_allocations.createMany({
          data: allocations.map((a) => ({
            transaction_id: created.id,
            case_id: a.case_id,
            role_in_case: a.role_in_case,
            amount: a.amount,
          })),
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'createPayoutAction',
        err,
        t.payroll.mutations.payoutCreateFailed,
        t.errors.db,
      ),
    };
  }

  // Логируем выплату по каждому затронутому делу. v3 s2: честное действие
  // payroll_payout (раньше маскировалось под payment_created в allowlist).
  for (const a of allocations) {
    await logActivity({
      entity_type: 'case',
      entity_id: a.case_id,
      action: 'payroll_payout',
      changes: { kind: 'payroll_payout', user_id: userId, amount: a.amount },
    });
  }

  revalidatePayroll(userId);
  return { ok: true, message: t.payroll.mutations.payoutSaved };
}

// Премия (bonus, «+») — мимо дел. Форма шлёт user_id, amount, comment.
export async function createBonusAction(
  _prev: PayrollMutationState,
  formData: FormData,
): Promise<PayrollMutationState> {
  const actor = await requireRole(['owner', 'admin']);
  const { t } = await getT();

  const userId = formData.get('user_id');
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return { ok: false, message: t.payroll.mutations.noEmployee };
  }

  const amountRaw = formData.get('amount');
  const normalized =
    typeof amountRaw === 'string' ? amountRaw.replace(',', '.').trim() : '';
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, message: t.payroll.mutations.badBonusAmount };
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000_000) {
    return { ok: false, message: t.payroll.mutations.bonusOutOfRange };
  }

  const occurredOn = formData.get('occurred_on');
  const occurred =
    typeof occurredOn === 'string' && DATE_RE.test(occurredOn)
      ? occurredOn
      : undefined;

  const commentRaw = formData.get('comment');
  const comment =
    typeof commentRaw === 'string' && commentRaw.trim().length > 0
      ? commentRaw.slice(0, 500)
      : null;

  try {
    await userDb(actor.profile.id, (tx) =>
      tx.payroll_transactions.create({
        data: {
          user_id: userId,
          kind: 'bonus',
          amount,
          comment,
          ...(occurred ? { occurred_on: toDbDate(occurred) } : {}),
          created_by: actor.profile.id,
        },
      }),
    );
  } catch (err) {
    return {
      ok: false,
      message: dbActionError('createBonusAction', err, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'payroll_bonus',
    changes: { user_id: userId, amount, comment, occurred_on: occurred ?? null },
  });

  revalidatePayroll(userId);
  return { ok: true, message: t.payroll.mutations.bonusSaved };
}

// Удаление движения (выплаты или премии) — owner/admin. Аллокации каскадом.
export async function deletePayrollTransactionAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireRole(['owner', 'admin']);
  const id = formData.get('transaction_id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return;

  const row = await userDb(actor.profile.id, (tx) =>
    tx.payroll_transactions.findUnique({
      where: { id },
      select: { user_id: true, kind: true, amount: true, occurred_on: true },
    }),
  );

  let deletedCount = 0;
  try {
    deletedCount = await userDb(actor.profile.id, (tx) =>
      tx.payroll_transactions.deleteMany({ where: { id } }).then((r) => r.count),
    );
  } catch (err) {
    console.error('deletePayrollTransactionAction failed:', err);
    return;
  }

  if (deletedCount > 0 && row) {
    await logActivity({
      entity_type: 'user',
      entity_id: row.user_id,
      action: 'payroll_tx_deleted',
      changes: {
        user_id: row.user_id,
        kind: row.kind,
        amount: Number(row.amount),
        occurred_on: row.occurred_on.toISOString().slice(0, 10),
      },
    });
  }

  revalidatePayroll(row?.user_id);
}
