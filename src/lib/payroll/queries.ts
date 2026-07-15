import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, toDbDate, ts } from '@/lib/db/convert';
import {
  rpcCasePayroll,
  rpcManageUserSalaries,
  rpcPayrollEmployeeCases,
  rpcPayrollEmployeeSummary,
} from '@/lib/db/rpc';
import { nextMonth } from '@/lib/payroll/month';
import type {
  CaseCategory,
  CasePayroll,
  CaseStage,
  ManagedUserSalary,
  PayrollEmployeeCase,
  PayrollEmployeeSummary,
  PayrollRate,
  PayrollTransaction,
  PayrollTxKind,
  RoleInCase,
  SalaryMode,
} from '@/lib/types/db';

// Начисление по конкретному делу (public.case_payroll). SECURITY INVOKER →
// вернёт строку только если пользователь видит дело (RLS на cases).
export async function getCasePayroll(caseId: string): Promise<CasePayroll | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await userDb(user.profile.id, (tx) =>
    rpcCasePayroll(tx, { caseId }),
  );
  const r = rows[0];
  if (!r) return null;
  return {
    category: r.category as CaseCategory,
    lawyer_percent: r.lawyer_percent,
    lawyer_amount: r.lawyer_amount,
    expert_percent: r.expert_percent,
    expert_amount: r.expert_amount,
    total: r.total,
  };
}

// Ставки % по категории. Читают staff и активные пользователи (для отображения
// начислений). Редактирует только owner (см. updatePayrollRateAction).
export async function getPayrollRates(): Promise<PayrollRate[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payroll_rates.findMany({
      orderBy: { category: 'asc' },
      select: {
        category: true,
        lawyer_percent: true,
        expert_percent: true,
        updated_at: true,
      },
    }),
  );
  return rows.map((r) => ({
    category: r.category as CaseCategory,
    lawyer_percent: dec(r.lawyer_percent),
    expert_percent: dec(r.expert_percent),
    updated_at: ts(r.updated_at),
  }));
}

// Режим зарплаты и оклад для редактора (v2 Этап 4). RPC manage_user_salaries —
// SECURITY DEFINER: вернёт строки тех, кого зритель видит по ЗП (payroll_user_visible),
// с флагом can_edit (право менять). Колонки salary_* защищены column-level
// привилегиями — читаются ТОЛЬКО через этот RPC, не прямым select по users.
export async function listManagedUserSalaries(): Promise<ManagedUserSalary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) => rpcManageUserSalaries(tx));
  return rows.map((r) => ({
    user_id: r.user_id,
    salary_mode: r.salary_mode as SalaryMode,
    salary_fixed_amount: r.salary_fixed_amount,
    can_edit: r.can_edit,
  }));
}

// ============================================================================
// Ручные движения зарплаты (правка №1): сводка по сотрудникам, разбивка по делам,
// история движений. RPC — SECURITY DEFINER с фильтром зрителя (staff — все,
// сотрудник — только себя). Прямые select по RLS — для истории движений.
// ============================================================================

// Список сотрудников с итогами (для /reports/payroll). month — первый день месяца
// ('YYYY-MM-01') для помесячного режима; null/undefined → за всё время.
// departmentId (v2 Этап 3) — пост-фильтр по подразделению сотрудника: RPC уже
// скоупит видимость (payroll_user_visible), здесь лишь сужаем до выбранного
// подразделения для тех, кто видит >1. Маппинг user→department читаем под RLS.
export async function getPayrollEmployeeSummary(
  month?: string | null,
  departmentId?: string | null,
): Promise<PayrollEmployeeSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const uid = user.profile.id;

  const rpcRows = await userDb(uid, (tx) =>
    rpcPayrollEmployeeSummary(tx, { month: month ?? null }),
  );
  let rows: PayrollEmployeeSummary[] = rpcRows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    earned: r.earned,
    fixed: r.fixed,
    bonus: r.bonus,
    payout: r.payout,
    balance: r.balance,
    salary_mode: r.salary_mode as SalaryMode,
  }));

  if (departmentId) {
    const members = await userDb(uid, (tx) =>
      tx.public_users.findMany({
        where: { department_id: departmentId },
        select: { id: true },
      }),
    );
    const allow = new Set(members.map((m) => m.id));
    rows = rows.filter((r) => allow.has(r.user_id));
  }

  return rows;
}

// Разбивка ЗП сотрудника по делам (для карточки). RPC режет видимость.
// month — первый день месяца ('YYYY-MM-01'); null/undefined → за всё время.
export async function getPayrollEmployeeCases(
  userId: string,
  month?: string | null,
): Promise<PayrollEmployeeCase[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    rpcPayrollEmployeeCases(tx, { userId, month: month ?? null }),
  );
  return rows.map((r) => ({
    case_id: r.case_id,
    number_title: r.number_title,
    stage: r.stage as CaseStage,
    role_in_case: r.role_in_case as RoleInCase,
    paid_total: r.paid_total,
    percent: r.percent,
    earned: r.earned,
    paid: r.paid,
    outstanding: r.outstanding,
  }));
}

// Сколько уже ВЫПЛАЧЕНО по делу в разрезе роли (сумма аллокаций выплат).
// Для карточки дела: показать «выплачено/осталось» по юристу и эксперту.
// RLS payout_allocations: staff видит все, специалист — только свои выплаты,
// поэтому не-staff увидит только сумму по своей роли (чужая = 0) — это норма.
export async function getCasePaidByRole(
  caseId: string,
): Promise<{ lawyer: number; expert: number }> {
  const user = await getCurrentUser();
  if (!user) return { lawyer: 0, expert: 0 };

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payout_allocations.findMany({
      where: { case_id: caseId },
      select: { role_in_case: true, amount: true },
    }),
  );
  const acc = { lawyer: 0, expert: 0 };
  for (const r of rows) {
    if (r.role_in_case === 'lawyer' || r.role_in_case === 'expert') {
      acc[r.role_in_case] += dec(r.amount);
    }
  }
  return acc;
}

// История движений сотрудника (выплаты + премии) с аллокациями по делам.
// RLS payroll_transactions/payout_allocations: staff — все, сотрудник — свои.
export async function getPayrollTransactions(
  userId: string,
  month?: string | null,
): Promise<PayrollTransaction[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Помесячный режим: только движения с occurred_on внутри месяца.
  const occurredFilter = month
    ? { gte: toDbDate(month), lt: toDbDate(nextMonth(month)) }
    : undefined;

  const rows = await userDb(user.profile.id, (tx) =>
    tx.payroll_transactions.findMany({
      where: {
        user_id: userId,
        ...(occurredFilter ? { occurred_on: occurredFilter } : {}),
      },
      orderBy: [{ occurred_on: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        user_id: true,
        kind: true,
        amount: true,
        comment: true,
        occurred_on: true,
        created_at: true,
        payout_allocations: {
          select: {
            case_id: true,
            role_in_case: true,
            amount: true,
            cases: { select: { number_title: true } },
          },
        },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    kind: r.kind as PayrollTxKind,
    amount: dec(r.amount),
    comment: r.comment,
    occurred_on: dateOnly(r.occurred_on),
    created_at: ts(r.created_at),
    allocations: r.payout_allocations.map((a) => ({
      case_id: a.case_id,
      number_title: a.cases?.number_title ?? '—',
      role_in_case: a.role_in_case as RoleInCase,
      amount: dec(a.amount),
    })),
  }));
}
