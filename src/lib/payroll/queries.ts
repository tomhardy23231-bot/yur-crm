import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { nextMonth } from '@/lib/payroll/month';
import type {
  CaseCategory,
  CasePayroll,
  CaseStage,
  LedgerStatus,
  PayrollBySpecialist,
  PayrollEmployeeCase,
  PayrollEmployeeSummary,
  PayrollLedgerEntry,
  PayrollLedgerWithRefs,
  PayrollPayoutBySpecialist,
  PayrollRate,
  PayrollTransaction,
  PayrollTxKind,
  RoleInCase,
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

// ============================================================================
// Ручные движения зарплаты (правка №1): сводка по сотрудникам, разбивка по делам,
// история движений. RPC — SECURITY DEFINER с фильтром зрителя (staff — все,
// сотрудник — только себя). Прямые select по RLS — для истории движений.
// ============================================================================

// Список сотрудников с итогами (для /reports/payroll). month — первый день месяца
// ('YYYY-MM-01') для помесячного режима; null/undefined → за всё время.
export async function getPayrollEmployeeSummary(
  month?: string | null,
): Promise<PayrollEmployeeSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('payroll_employee_summary', {
    p_month: month ?? null,
  });
  if (error) {
    throw new Error(`getPayrollEmployeeSummary failed: ${error.message}`);
  }
  type Row = {
    user_id: string;
    full_name: string;
    earned: number | string;
    bonus: number | string;
    payout: number | string;
    balance: number | string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    earned: Number(r.earned),
    bonus: Number(r.bonus),
    payout: Number(r.payout),
    balance: Number(r.balance),
  }));
}

// Разбивка ЗП сотрудника по делам (для карточки). RPC режет видимость.
// month — первый день месяца ('YYYY-MM-01'); null/undefined → за всё время.
export async function getPayrollEmployeeCases(
  userId: string,
  month?: string | null,
): Promise<PayrollEmployeeCase[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('payroll_employee_cases', {
    p_user_id: userId,
    p_month: month ?? null,
  });
  if (error) {
    throw new Error(`getPayrollEmployeeCases failed: ${error.message}`);
  }
  type Row = {
    case_id: string;
    number_title: string;
    stage: CaseStage;
    role_in_case: RoleInCase;
    paid_total: number | string;
    percent: number | string;
    earned: number | string;
    paid: number | string;
    outstanding: number | string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    case_id: r.case_id,
    number_title: r.number_title,
    stage: r.stage,
    role_in_case: r.role_in_case,
    paid_total: Number(r.paid_total),
    percent: Number(r.percent),
    earned: Number(r.earned),
    paid: Number(r.paid),
    outstanding: Number(r.outstanding),
  }));
}

// Сколько уже ВЫПЛАЧЕНО по делу в разрезе роли (сумма аллокаций выплат).
// Для карточки дела: показать «выплачено/осталось» по юристу и эксперту.
// RLS payout_allocations: staff видит все, специалист — только свои выплаты,
// поэтому не-staff увидит только сумму по своей роли (чужая = 0) — это норма.
export async function getCasePaidByRole(
  caseId: string,
): Promise<{ lawyer: number; expert: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payout_allocations')
    .select('role_in_case, amount')
    .eq('case_id', caseId);
  if (error) {
    throw new Error(`getCasePaidByRole failed: ${error.message}`);
  }
  const acc = { lawyer: 0, expert: 0 };
  for (const r of (data ?? []) as Array<{
    role_in_case: RoleInCase;
    amount: number | string;
  }>) {
    acc[r.role_in_case] += Number(r.amount);
  }
  return acc;
}

// История движений сотрудника (выплаты + премии) с аллокациями по делам.
// RLS payroll_transactions/payout_allocations: staff — все, сотрудник — свои.
export async function getPayrollTransactions(
  userId: string,
  month?: string | null,
): Promise<PayrollTransaction[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('payroll_transactions')
    .select(
      'id, user_id, kind, amount, comment, occurred_on, created_at, ' +
        'allocations:payout_allocations(case_id, role_in_case, amount, case:case_id(number_title))',
    )
    .eq('user_id', userId);
  // Помесячный режим: только движения с occurred_on внутри месяца.
  if (month) {
    const next = nextMonth(month);
    query = query.gte('occurred_on', month).lt('occurred_on', next);
  }
  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`getPayrollTransactions failed: ${error.message}`);
  }

  type AllocRow = {
    case_id: string;
    role_in_case: RoleInCase;
    amount: number | string;
    case:
      | { number_title: string }
      | ReadonlyArray<{ number_title: string }>
      | null;
  };
  type Row = {
    id: string;
    user_id: string;
    kind: PayrollTxKind;
    amount: number | string;
    comment: string | null;
    occurred_on: string;
    created_at: string;
    allocations: AllocRow[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    kind: r.kind,
    amount: Number(r.amount),
    comment: r.comment,
    occurred_on: r.occurred_on,
    created_at: r.created_at,
    allocations: (r.allocations ?? []).map((a) => {
      const caseRef = Array.isArray(a.case) ? (a.case[0] ?? null) : a.case;
      return {
        case_id: a.case_id,
        number_title: caseRef?.number_title ?? '—',
        role_in_case: a.role_in_case,
        amount: Number(a.amount),
      };
    }),
  }));
}
