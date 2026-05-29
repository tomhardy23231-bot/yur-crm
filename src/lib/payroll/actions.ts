'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CASE_CATEGORIES, type CaseCategory } from '@/lib/types/db';

export type PayrollRatesActionState = {
  ok: boolean;
  message?: string;
};

function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}

// Обновление ставок % по категориям. Только owner (RLS payroll_rates_write_owner
// дублирует это на стороне БД). Форма шлёт по полю на каждую категорию:
// percent_<category>.
export async function updatePayrollRatesAction(
  _prev: PayrollRatesActionState,
  formData: FormData,
): Promise<PayrollRatesActionState> {
  await requireRole(['owner']);
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

export async function markLedgerPaidAction(formData: FormData): Promise<void> {
  await requireRole(['owner', 'admin']);
  const id = formData.get('ledger_id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();
  // .eq('status','accrued') — идемпотентно, не трогаем уже выплаченные.
  await supabase
    .from('payroll_ledger')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'accrued');

  revalidateLedger(formData);
}

export async function revertLedgerPaidAction(formData: FormData): Promise<void> {
  await requireRole(['owner', 'admin']);
  const id = formData.get('ledger_id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('payroll_ledger')
    .update({ status: 'accrued', paid_at: null })
    .eq('id', id)
    .eq('status', 'paid');

  revalidateLedger(formData);
}
