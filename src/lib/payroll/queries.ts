import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CaseCategory,
  CasePayroll,
  LedgerStatus,
  PayrollBySpecialist,
  PayrollLedgerEntry,
  PayrollLedgerWithRefs,
  PayrollPayoutBySpecialist,
  PayrollRate,
} from '@/lib/types/db';

// Начисление по конкретному делу (public.case_payroll). SECURITY INVOKER →
// вернёт строку только если пользователь видит дело (RLS на cases).
export async function getCasePayroll(caseId: string): Promise<CasePayroll | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('case_payroll', {
    p_case_id: caseId,
  });
  if (error) {
    throw new Error(`getCasePayroll failed: ${error.message}`);
  }
  type Row = {
    category: CaseCategory;
    lawyer_percent: number | string;
    lawyer_amount: number | string;
    expert_percent: number | string;
    expert_amount: number | string;
    total: number | string;
  };
  const rows = (data ?? []) as Row[];
  const r = rows[0];
  if (!r) return null;
  return {
    category: r.category,
    lawyer_percent: Number(r.lawyer_percent),
    lawyer_amount: Number(r.lawyer_amount),
    expert_percent: Number(r.expert_percent),
    expert_amount: Number(r.expert_amount),
    total: Number(r.total),
  };
}

// Сводка начислений по сотрудникам (public.payroll_by_specialist). RLS на cases
// ограничивает строки: staff видит всех, юрист/Експерт — только свои дела.
export async function listPayrollBySpecialist(): Promise<PayrollBySpecialist[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('payroll_by_specialist');
  if (error) {
    throw new Error(`listPayrollBySpecialist failed: ${error.message}`);
  }
  type Row = {
    user_id: string;
    full_name: string;
    role_in_case: 'lawyer' | 'expert';
    case_count: number | string;
    paid_base: number | string;
    earned: number | string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    role_in_case: r.role_in_case,
    case_count: Number(r.case_count),
    paid_base: Number(r.paid_base),
    earned: Number(r.earned),
  }));
}

// Ставки % по категории. Читают staff и активные пользователи (для отображения
// начислений). Редактирует только owner (см. updatePayrollRateAction).
export async function getPayrollRates(): Promise<PayrollRate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payroll_rates')
    .select('category, lawyer_percent, expert_percent, updated_at')
    .order('category', { ascending: true });
  if (error) {
    throw new Error(`getPayrollRates failed: ${error.message}`);
  }
  type Row = {
    category: CaseCategory;
    lawyer_percent: number | string;
    expert_percent: number | string;
    updated_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    category: r.category,
    lawyer_percent: Number(r.lawyer_percent),
    expert_percent: Number(r.expert_percent),
    updated_at: r.updated_at,
  }));
}

// ============================================================================
// Леджер начислений/выплат (P1.3). RLS: staff видит всё, юрист/Експерт — своё.
// ============================================================================

type LedgerRaw = {
  id: string;
  case_id: string;
  user_id: string;
  role_in_case: 'lawyer' | 'expert';
  base_amount: number | string;
  percent: number | string;
  amount: number | string;
  status: LedgerStatus;
  accrued_at: string;
  paid_at: string | null;
  paid_by: string | null;
};

function normalizeLedger(r: LedgerRaw): PayrollLedgerEntry {
  return {
    id: r.id,
    case_id: r.case_id,
    user_id: r.user_id,
    role_in_case: r.role_in_case,
    base_amount: Number(r.base_amount),
    percent: Number(r.percent),
    amount: Number(r.amount),
    status: r.status,
    accrued_at: r.accrued_at,
    paid_at: r.paid_at,
    paid_by: r.paid_by,
  };
}

// Начисления по конкретному делу — для карточки. RLS отрежет, если дело не видно.
export async function listLedgerByCase(
  caseId: string,
): Promise<PayrollLedgerEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payroll_ledger')
    .select(
      'id, case_id, user_id, role_in_case, base_amount, percent, amount, status, accrued_at, paid_at, paid_by',
    )
    .eq('case_id', caseId)
    .order('role_in_case', { ascending: true })
    .order('accrued_at', { ascending: true });
  if (error) {
    throw new Error(`listLedgerByCase failed: ${error.message}`);
  }
  return ((data ?? []) as LedgerRaw[]).map(normalizeLedger);
}

// Все видимые начисления (отчёт выплат). staff — все; специалист — свои (RLS).
export async function listLedger(): Promise<PayrollLedgerWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payroll_ledger')
    .select(
      'id, case_id, user_id, role_in_case, base_amount, percent, amount, status, accrued_at, paid_at, paid_by, ' +
        'user:user_id(id, full_name), case:case_id(id, number_title)',
    )
    .order('status', { ascending: true })
    .order('accrued_at', { ascending: false });
  if (error) {
    throw new Error(`listLedger failed: ${error.message}`);
  }

  type Row = LedgerRaw & {
    user:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
    case:
      | ReadonlyArray<{ id: string; number_title: string }>
      | { id: string; number_title: string }
      | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const user = Array.isArray(r.user) ? (r.user[0] ?? null) : r.user;
    const caseRef = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
    return { ...normalizeLedger(r), user, case: caseRef };
  });
}

// Сводка по леджеру: начислено всего / выплачено / к выплате (Задача 5).
// SECURITY INVOKER на RPC → RLS payroll_ledger режет строки (staff — все,
// специалист — только свои).
export async function listPayrollPayoutBySpecialist(): Promise<
  PayrollPayoutBySpecialist[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('payroll_payout_by_specialist');
  if (error) {
    throw new Error(`listPayrollPayoutBySpecialist failed: ${error.message}`);
  }
  type Row = {
    user_id: string;
    full_name: string;
    role_in_case: 'lawyer' | 'expert';
    total: number | string;
    paid: number | string;
    outstanding: number | string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    role_in_case: r.role_in_case,
    total: Number(r.total),
    paid: Number(r.paid),
    outstanding: Number(r.outstanding),
  }));
}
