import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec, toDbDate } from '@/lib/db/convert';
import {
  getPayrollEmployeeCases,
  getPayrollEmployeeSummary,
  getPayrollTransactions,
} from '@/lib/payroll/queries';
import { monthLabel, monthNamesFrom, nextMonth } from '@/lib/payroll/month';
import { getT } from '@/lib/i18n/server';
import type {
  CaseCategory,
  PayrollEmployeeCase,
  PayrollEmployeeSummary,
  PayrollTransaction,
} from '@/lib/types/db';

// ============================================================================
// Сборка данных для печатных отчётов по зарплате (route-group (print)).
// Поверх существующих queries — без новых миграций. RLS режет видимость:
// сотрудник получит только свои строки, staff — всех.
// ============================================================================

export type ReportPayout = {
  id: string;
  occurred_on: string;
  amount: number;
  comment: string | null;
  // Доли по делам внутри выплаты + неявная доля премий (amount − Σ аллокаций).
  allocations: PayrollTransaction['allocations'];
  bonusPortion: number;
};

export type ReportBonus = {
  id: string;
  occurred_on: string;
  amount: number;
  comment: string | null;
};

// Дело с начислением + обогащение (клиент, категория, договор).
export type ReportCase = PayrollEmployeeCase & {
  client_name: string | null;
  category: CaseCategory | null;
  contract_sum: number | null;
  opened_at: string | null;
};

// Оплата клиента по делу за период (основание начисления — «когда и сколько»).
export type ClientPayment = {
  case_id: string;
  number_title: string;
  paid_at: string;
  amount: number;
  method: string | null;
};

export type EmployeeReport = {
  userId: string;
  fullName: string;
  month: string;
  monthLabel: string;
  // Сводка роли по всем делам (для шапки «юрист — N · эксперт — M дел»).
  lawyerCount: number;
  expertCount: number;
  // Итоги ЗА МЕСЯЦ.
  earnedMonth: number;
  bonusMonth: number;
  payoutMonth: number;
  // Накопленный долг «к выплате сейчас» (за всё время) + разбивка.
  balance: number;
  casesOutstandingAll: number;
  bonusOutstandingAll: number;
  // Разбивка начислений по ролям (за месяц).
  lawyerEarned: number;
  expertEarned: number;
  // Агрегаты по делам месяца.
  casesCount: number;
  contractSumTotal: number;
  clientPaidTotal: number;
  // Дела с начислением за месяц (по которым в месяце были оплаты).
  cases: ReportCase[];
  // Оплаты клиентов по делам за месяц (таймлайн «когда и сколько»).
  clientPayments: ClientPayment[];
  // Премии и выплаты за месяц.
  bonuses: ReportBonus[];
  payouts: ReportPayout[];
};

export type SummaryReportRow = PayrollEmployeeSummary;

export type SummaryReport = {
  month: string;
  monthLabel: string;
  rows: SummaryReportRow[];
  totals: {
    earned: number;
    bonus: number;
    payout: number;
    balance: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Детальный отчёт по одному сотруднику за месяц.
export async function buildEmployeeReport(
  userId: string,
  month: string,
): Promise<EmployeeReport> {
  const { t } = await getT();
  const viewer = await getCurrentUser();
  const uid = viewer?.profile.id ?? null;

  const [userRow, summary, monthCases, allCases, monthTx, allTx] =
    await Promise.all([
      uid
        ? userDb(uid, (tx) =>
            tx.public_users.findUnique({
              where: { id: userId },
              select: { full_name: true },
            }),
          )
        : Promise.resolve(null),
      getPayrollEmployeeSummary(month),
      getPayrollEmployeeCases(userId, month),
      getPayrollEmployeeCases(userId),
      getPayrollTransactions(userId, month),
      getPayrollTransactions(userId),
    ]);

  const row = summary.find((r) => r.user_id === userId);
  const fullName = userRow?.full_name ?? row?.full_name ?? t.payrollPrint.fallbackEmployeeName;

  const earnedMonth = row?.earned ?? monthCases.reduce((s, c) => s + c.earned, 0);
  const bonusMonth = row?.bonus ?? 0;
  const payoutMonth = row?.payout ?? 0;
  const balance = row?.balance ?? 0;

  // Накопленные остатки (за всё время) — для блока «к выплате».
  const caseAllocatedAll = allCases.reduce((s, c) => s + c.paid, 0);
  const payoutTotalAll = allTx
    .filter((t) => t.kind === 'payout')
    .reduce((s, t) => s + t.amount, 0);
  const bonusTotalAll = allTx
    .filter((t) => t.kind === 'bonus')
    .reduce((s, t) => s + t.amount, 0);
  const bonusPaidAll = Math.max(0, round2(payoutTotalAll - caseAllocatedAll));
  const bonusOutstandingAll = Math.max(0, round2(bonusTotalAll - bonusPaidAll));
  const casesOutstandingAll = allCases.reduce(
    (s, c) => s + Math.max(0, c.outstanding),
    0,
  );

  // Роли по всем делам.
  const lawyerCount = allCases.filter((c) => c.role_in_case === 'lawyer').length;
  const expertCount = allCases.filter((c) => c.role_in_case === 'expert').length;

  // Дела с начислением за месяц: закрытые ниже, затем по убыванию начисления.
  const monthCasesShown = monthCases
    .filter((c) => c.paid_total > 0 || c.earned > 0)
    .sort((a, b) => {
      const ac = a.stage === 'closed' ? 1 : 0;
      const bc = b.stage === 'closed' ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return b.earned - a.earned;
    });

  // Обогащение: клиент, категория, сумма договора по делам месяца + таймлайн
  // оплат клиента за период. RLS режет по зрителю (staff — все, сотрудник — свои).
  const caseIds = [...new Set(monthCasesShown.map((c) => c.case_id))];
  const monthEnd = nextMonth(month);

  type CaseMeta = {
    id: string;
    category: CaseCategory;
    contract_sum: number;
    opened_at: string;
    client_name: string | null;
  };

  const [caseMetaRows, paymentRows] = await Promise.all([
    caseIds.length && uid
      ? userDb(uid, (tx) =>
          tx.cases.findMany({
            where: { id: { in: caseIds } },
            select: {
              id: true,
              category: true,
              contract_sum: true,
              opened_at: true,
              clients: { select: { name: true } },
            },
          }),
        )
      : Promise.resolve([]),
    caseIds.length && uid
      ? userDb(uid, (tx) =>
          tx.payments.findMany({
            where: {
              case_id: { in: caseIds },
              paid_at: { gte: toDbDate(month), lt: toDbDate(monthEnd) },
            },
            orderBy: { paid_at: 'asc' },
            select: { case_id: true, amount: true, paid_at: true, method: true },
          }),
        )
      : Promise.resolve([]),
  ]);

  const metaById = new Map<string, CaseMeta>();
  for (const m of caseMetaRows) {
    metaById.set(m.id, {
      id: m.id,
      category: m.category as CaseCategory,
      contract_sum: dec(m.contract_sum),
      opened_at: dateOnly(m.opened_at),
      client_name: m.clients?.name ?? null,
    });
  }
  const titleById = new Map(monthCasesShown.map((c) => [c.case_id, c.number_title]));

  const cases: ReportCase[] = monthCasesShown.map((c) => {
    const meta = metaById.get(c.case_id);
    return {
      ...c,
      client_name: meta?.client_name ?? null,
      category: meta?.category ?? null,
      contract_sum: meta?.contract_sum ?? null,
      opened_at: meta?.opened_at ?? null,
    };
  });

  const clientPayments: ClientPayment[] = paymentRows
    .map((p) => ({
      case_id: p.case_id,
      number_title: titleById.get(p.case_id) ?? t.common.dash,
      paid_at: dateOnly(p.paid_at),
      amount: dec(p.amount),
      method: p.method,
    }))
    // Только дела, попавшие в начисления месяца (на всякий случай).
    .filter((p) => titleById.has(p.case_id));

  const lawyerEarned = cases
    .filter((c) => c.role_in_case === 'lawyer')
    .reduce((s, c) => s + c.earned, 0);
  const expertEarned = cases
    .filter((c) => c.role_in_case === 'expert')
    .reduce((s, c) => s + c.earned, 0);
  const contractSumTotal = cases.reduce((s, c) => s + (c.contract_sum ?? 0), 0);
  const clientPaidTotal = clientPayments.reduce((s, p) => s + p.amount, 0);

  const bonuses: ReportBonus[] = monthTx
    .filter((t) => t.kind === 'bonus')
    .map((t) => ({
      id: t.id,
      occurred_on: t.occurred_on,
      amount: t.amount,
      comment: t.comment,
    }));

  const payouts: ReportPayout[] = monthTx
    .filter((t) => t.kind === 'payout')
    .map((t) => {
      const allocSum = t.allocations.reduce((s, a) => s + a.amount, 0);
      return {
        id: t.id,
        occurred_on: t.occurred_on,
        amount: t.amount,
        comment: t.comment,
        allocations: t.allocations,
        bonusPortion: Math.max(0, round2(t.amount - allocSum)),
      };
    });

  return {
    userId,
    fullName,
    month,
    monthLabel: monthLabel(month, monthNamesFrom(t.payroll)),
    lawyerCount,
    expertCount,
    earnedMonth,
    bonusMonth,
    payoutMonth,
    balance,
    casesOutstandingAll,
    bonusOutstandingAll,
    lawyerEarned,
    expertEarned,
    casesCount: cases.length,
    contractSumTotal,
    clientPaidTotal,
    cases,
    clientPayments,
    bonuses,
    payouts,
  };
}

// Сводный отчёт за всех сотрудников за месяц (staff с view_all_payroll).
export async function buildSummaryReport(month: string): Promise<SummaryReport> {
  const { t } = await getT();
  const rows = await getPayrollEmployeeSummary(month);
  const sorted = [...rows].sort((a, b) => b.balance - a.balance);
  const totals = sorted.reduce(
    (acc, r) => ({
      earned: acc.earned + r.earned,
      bonus: acc.bonus + r.bonus,
      payout: acc.payout + r.payout,
      balance: acc.balance + r.balance,
    }),
    { earned: 0, bonus: 0, payout: 0, balance: 0 },
  );
  return {
    month,
    monthLabel: monthLabel(month, monthNamesFrom(t.payroll)),
    rows: sorted,
    totals,
  };
}
