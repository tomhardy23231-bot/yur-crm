'use server';

import { revalidatePath } from 'next/cache';

import { requireRole, requireCap } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CASE_CATEGORIES, type CaseCategory } from '@/lib/types/db';

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
  await requireCap('edit_payroll_rates');
  const supabase = await createSupabaseServerClient();

  // Парсит и валидирует процент из поля формы (0..100, запятая/точка).
  function parsePercent(field: string): number | { error: string } {
    const raw = formData.get(field);
    if (typeof raw !== 'string') return { error: `Поле ${field} отсутствует` };
    const n = Number(raw.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: 'Процент — число от 0 до 100' };
    }
    return n;
  }

  for (const category of CASE_CATEGORIES) {
    if (!isCaseCategory(category)) continue;

    const lawyer = parsePercent(`lawyer_percent_${category}`);
    if (typeof lawyer !== 'number') {
      return { ok: false, message: `Юрист, «${category}»: ${lawyer.error}` };
    }
    const expert = parsePercent(`expert_percent_${category}`);
    if (typeof expert !== 'number') {
      return { ok: false, message: `Эксперт, «${category}»: ${expert.error}` };
    }

    const { error } = await supabase
      .from('payroll_rates')
      .update({
        lawyer_percent: lawyer,
        expert_percent: expert,
        updated_at: new Date().toISOString(),
      })
      .eq('category', category);
    if (error) {
      return { ok: false, message: error.message };
    }
  }

  revalidatePath('/settings/payroll');
  revalidatePath('/reports/payroll');
  return { ok: true, message: 'Ставки сохранены.' };
}

// ============================================================================
// Леджер: отметка «выплачено» / откат. Только owner/admin (RLS дублирует).
// bare actions (форма-кнопка), без useActionState.
// ============================================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ревалидируем отчёт и (если форма из карточки дела) саму карточку.
function revalidateLedger(formData: FormData): void {
  revalidatePath('/reports/payroll');
  const caseId = formData.get('case_id');
  if (typeof caseId === 'string' && UUID_RE.test(caseId)) {
    revalidatePath(`/cases/${caseId}`);
  }
}

// Строка леджера для логирования (case_id берём из БД, не из formData — CSO).
type LedgerLogRow = {
  case_id: string;
  user_id: string;
  role_in_case: 'lawyer' | 'expert';
  amount: number | string;
  status: 'accrued' | 'paid';
};

export async function markLedgerPaidAction(formData: FormData): Promise<void> {
  const user = await requireRole(['owner', 'admin']);
  const id = formData.get('ledger_id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();

  // Снапшот до правки — для лога (case_id из БД-truth) и проверки статуса.
  const { data: row } = await supabase
    .from('payroll_ledger')
    .select('case_id, user_id, role_in_case, amount, status')
    .eq('id', id)
    .maybeSingle<LedgerLogRow>();

  // .eq('status','accrued') — идемпотентно, не трогаем уже выплаченные.
  // paid_by — кто отметил выплату (owner/admin). RLS update дублирует доступ.
  // Класс гонки из revert здесь невозможен: отметка accrued→paid УБИРАЕТ
  // accrued-строку, а не создаёт вторую, поэтому payroll_ledger_one_accrued_idx
  // нарушить нельзя (индекс — только на status='accrued').
  const { error } = await supabase
    .from('payroll_ledger')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: user.profile.id,
    })
    .eq('id', id)
    .eq('status', 'accrued');

  // Логируем только если правка реально применилась (строка была accrued).
  if (!error && row && row.status === 'accrued') {
    await logActivity({
      entity_type: 'case',
      entity_id: row.case_id,
      action: 'payroll_paid',
      changes: {
        ledger_id: id,
        user_id: row.user_id,
        role_in_case: row.role_in_case,
        amount: Number(row.amount),
      },
    });
  }

  revalidateLedger(formData);
}

export async function revertLedgerPaidAction(formData: FormData): Promise<void> {
  await requireRole(['owner', 'admin']);
  const id = formData.get('ledger_id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();

  // Снапшот до отката — для лога (case_id из БД-truth). Берём ДО rpc, т.к. при
  // слиянии откатываемая paid-строка удаляется и после прочитать её нельзя.
  const { data: row } = await supabase
    .from('payroll_ledger')
    .select('case_id, user_id, role_in_case, amount, status')
    .eq('id', id)
    .maybeSingle<LedgerLogRow>();

  // Откат через атомарную БД-функцию: paid → accrued со СЛИЯНИЕМ в существующий
  // остаток. Простой update paid→accrued ломался, когда по роли×делу уже была
  // accrued-строка (доплата клиента) → две accrued → нарушение
  // payroll_ledger_one_accrued_idx. Права (owner/admin) проверяет сама функция
  // через private.can_manage_users() (RLS-политика update дублирует это).
  const { error } = await supabase.rpc('revert_payout', { p_ledger_id: id });

  if (!error && row && row.status === 'paid') {
    await logActivity({
      entity_type: 'case',
      entity_id: row.case_id,
      action: 'payroll_reverted',
      changes: {
        ledger_id: id,
        user_id: row.user_id,
        role_in_case: row.role_in_case,
        amount: Number(row.amount),
      },
    });
  }

  revalidateLedger(formData);
}
