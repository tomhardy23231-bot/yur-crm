import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  CASE_CATEGORIES,
  CASE_STAGES,
  type CaseCategory,
  type CaseStage,
  type PayrollRate,
} from '@/lib/types/db';

// ============================================================================
// Слой данных дашборда. Всё читается под сессией пользователя → RLS сам
// ограничивает видимость: staff видит все дела/платежи, юрист — где он
// lawyer_id, Эксперт — где responsible_id. Поэтому воронка, выручка и личные
// начисления автоматически считаются «по своим» для специалистов.
// ============================================================================

export type DashboardCaseRow = {
  id: string;
  number_title: string;
  stage: CaseStage;
  category: CaseCategory;
  contract_sum: number;
  paid_total: number;
  debt: number;
  opened_at: string;
  // Нужны для расчёта личных начислений (роль пользователя в деле + override %).
  lawyer_id: string;
  responsible_id: string;
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
};

// Все RLS-видимые дела (без пагинации) — база для KPI, воронки и выручки.
// Объём в Phase 1 умеренный; та же стратегия, что у канбан-доски.
export async function getDashboardCases(): Promise<DashboardCaseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .select(
      'id, number_title, stage, category, contract_sum, paid_total, debt, opened_at, ' +
        'lawyer_id, responsible_id, lawyer_rate_override, expert_rate_override',
    );
  if (error) {
    throw new Error(`getDashboardCases failed: ${error.message}`);
  }

  type Raw = {
    id: string;
    number_title: string;
    stage: CaseStage;
    category: CaseCategory;
    contract_sum: number | string;
    paid_total: number | string;
    debt: number | string;
    opened_at: string;
    lawyer_id: string;
    responsible_id: string;
    lawyer_rate_override: number | string | null;
    expert_rate_override: number | string | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    category: r.category,
    contract_sum: Number(r.contract_sum),
    paid_total: Number(r.paid_total),
    debt: Number(r.debt),
    opened_at: r.opened_at,
    lawyer_id: r.lawyer_id,
    responsible_id: r.responsible_id,
    lawyer_rate_override:
      r.lawyer_rate_override == null ? null : Number(r.lawyer_rate_override),
    expert_rate_override:
      r.expert_rate_override == null ? null : Number(r.expert_rate_override),
  }));
}

// Выручка (сумма поступивших оплат) за текущий календарный месяц.
// RLS на payments наследует видимость дела → для staff это вся компания,
// для специалиста — его дела.
export async function getRevenueThisMonth(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  // Границы месяца считаем по часовому поясу фирмы (Украина), а не по TZ хоста
  // (Vercel/Node работают в UTC) — иначе в ночь на 1-е число окно «съедет» на
  // день. Закрываем диапазон сверху (.lt next month), чтобы будущие/ошибочные
  // даты платежей не раздували KPI «выручка за месяц».
  const { year, month } = currentKyivMonth();
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const firstOfNextMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('payments')
    .select('amount')
    .gte('paid_at', firstOfMonth)
    .lt('paid_at', firstOfNextMonth);
  if (error) {
    throw new Error(`getRevenueThisMonth failed: ${error.message}`);
  }

  return ((data ?? []) as Array<{ amount: number | string }>).reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
}

// Текущий год/месяц (1–12) в часовом поясе фирмы (Europe/Kyiv), независимо от
// TZ сервера. Используется для границ месяца и подписи месяца на дашборде.
export function currentKyivMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
  };
}

// ============================================================================
// Чистые агрегаторы (без БД) — считаются из getDashboardCases().
// ============================================================================

export type FunnelEntry = { stage: CaseStage; count: number };
export type CategoryRevenueEntry = {
  category: CaseCategory;
  paid: number;
  count: number;
};

export type DashboardStats = {
  activeCases: number; // все, кроме closed
  totalCases: number;
  totalDebt: number;
  totalPaid: number;
  totalContract: number;
  funnel: FunnelEntry[]; // все 5 этапов в порядке воронки
  revenueByCategory: CategoryRevenueEntry[]; // все 3 категории в порядке
};

export function computeDashboardStats(
  rows: ReadonlyArray<DashboardCaseRow>,
): DashboardStats {
  const funnel = new Map<CaseStage, number>(CASE_STAGES.map((s) => [s, 0]));
  const catPaid = new Map<CaseCategory, number>(
    CASE_CATEGORIES.map((c) => [c, 0]),
  );
  const catCount = new Map<CaseCategory, number>(
    CASE_CATEGORIES.map((c) => [c, 0]),
  );

  let totalDebt = 0;
  let totalPaid = 0;
  let totalContract = 0;
  let activeCases = 0;

  for (const r of rows) {
    funnel.set(r.stage, (funnel.get(r.stage) ?? 0) + 1);
    catPaid.set(r.category, (catPaid.get(r.category) ?? 0) + r.paid_total);
    catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
    totalDebt += r.debt;
    totalPaid += r.paid_total;
    totalContract += r.contract_sum;
    if (r.stage !== 'closed') activeCases += 1;
  }

  return {
    activeCases,
    totalCases: rows.length,
    totalDebt,
    totalPaid,
    totalContract,
    funnel: CASE_STAGES.map((stage) => ({
      stage,
      count: funnel.get(stage) ?? 0,
    })),
    revenueByCategory: CASE_CATEGORIES.map((category) => ({
      category,
      paid: catPaid.get(category) ?? 0,
      count: catCount.get(category) ?? 0,
    })),
  };
}

// ============================================================================
// Личные начисления специалиста (юрист/Эксперт).
// Для не-staff RLS возвращает только ЕГО дела, поэтому каждое видимое дело —
// то, по которому он получает полный % категории. earned = paid_total × % / 100.
// Совпадает с public.payroll_by_specialist для этого пользователя.
// ============================================================================

export type PersonalEarning = {
  id: string;
  number_title: string;
  stage: CaseStage;
  category: CaseCategory;
  role_in_case: 'lawyer' | 'expert';
  paid_total: number;
  percent: number;
  earned: number;
};

// Эффективная ставка пользователя по делу = его роль в деле (lawyer/expert),
// override этой роли при наличии, иначе дефолт категории для роли.
export function computePersonalEarnings(
  rows: ReadonlyArray<DashboardCaseRow>,
  rates: ReadonlyArray<PayrollRate>,
  userId: string,
): PersonalEarning[] {
  const rateByCategory = new Map<CaseCategory, PayrollRate>(
    rates.map((r) => [r.category, r]),
  );

  return rows
    .map((r) => {
      const isLawyer = r.lawyer_id === userId;
      const role_in_case: 'lawyer' | 'expert' = isLawyer ? 'lawyer' : 'expert';
      const rate = rateByCategory.get(r.category);
      const override = isLawyer ? r.lawyer_rate_override : r.expert_rate_override;
      const categoryDefault = isLawyer
        ? (rate?.lawyer_percent ?? 0)
        : (rate?.expert_percent ?? 0);
      const percent = override ?? categoryDefault;
      return {
        id: r.id,
        number_title: r.number_title,
        stage: r.stage,
        category: r.category,
        role_in_case,
        paid_total: r.paid_total,
        percent,
        earned: (r.paid_total * percent) / 100,
      };
    })
    .sort((a, b) => b.earned - a.earned || b.paid_total - a.paid_total);
}
