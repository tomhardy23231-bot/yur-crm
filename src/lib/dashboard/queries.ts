import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CaseCategory,
  CaseStage,
  PayrollRate,
} from '@/lib/types/db';
import type {
  DashboardAnalytics,
  DashboardCaseRow,
  MetricSeries,
} from './compute';

// Чистые агрегаторы вынесены в ./compute (юнит-тестируемы без 'server-only').
// Реэкспортируем, чтобы существующие импорты из этого модуля продолжали работать.
export {
  computeDashboardStats,
  computeDelta,
  computePersonalEarnings,
} from './compute';
export type {
  CategoryRevenueEntry,
  DashboardAnalytics,
  DashboardCaseRow,
  DashboardStats,
  FunnelEntry,
  MetricSeries,
  PersonalEarning,
} from './compute';

// ============================================================================
// Слой данных дашборда. Всё читается под сессией пользователя → RLS сам
// ограничивает видимость: staff видит все дела/платежи, юрист — где он
// lawyer_id, Эксперт — где responsible_id. Поэтому воронка, выручка и личные
// начисления автоматически считаются «по своим» для специалистов.
// ============================================================================

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

// Сотрудники на окладе (salary_mode='fixed') в зоне видимости зрителя по ЗП.
// v2 Этап 4: их процентная часть зануляется в метриках дашборда (личное «начислено
// мне» и фонд ЗП). salary_mode защищён column-level привилегиями → читаем через
// SECURITY DEFINER-RPC manage_user_salaries (специалист получит лишь свою строку —
// этого достаточно для его личных метрик; staff — всех в своей зоне видимости).
export async function getFixedSalaryUserIds(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('manage_user_salaries');
  if (error) {
    throw new Error(`getFixedSalaryUserIds failed: ${error.message}`);
  }
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string; salary_mode: string }>) {
    if (r.salary_mode === 'fixed') out.add(r.user_id);
  }
  return out;
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
// Аналитический слой (бриф §3.1, §8): сравнение с прошлым периодом + спарклайны.
// Всё под сессией пользователя → RLS уже ограничивает видимость. Для staff —
// метрики по всей компании; для специалиста (передан userId) — по его делам,
// и «начислено» считается по ЕГО роли в деле (юрист ИЛИ эксперт), а не как фонд.
// ============================================================================

// Границы месяца со сдвигом offset (0 = текущий) в TZ фирмы (Europe/Kyiv).
function kyivMonthWindow(offset: number): { firstISO: string; nextISO: string } {
  const { year, month } = currentKyivMonth(); // month 1..12
  const base = year * 12 + (month - 1) - offset; // абсолютный индекс месяца
  const y = Math.floor(base / 12);
  const m = (base % 12) + 1; // 1..12
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    firstISO: `${y}-${String(m).padStart(2, '0')}-01`,
    nextISO: `${ny}-${String(nm).padStart(2, '0')}-01`,
  };
}

type AnalyticsCaseRow = {
  id: string;
  contract_sum: number;
  opened_at: string;
  closed_at: string | null;
  category: CaseCategory;
  lawyer_id: string;
  responsible_id: string;
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
};

type AnalyticsPaymentRow = { case_id: string; amount: number; paid_at: string };

// Считает 4 метрики за 6 последних месяцев под текущей сессией (RLS).
// fixedUserIds (v2 Этап 4) — сотрудники на окладе: их % обнуляется и в личной
// метрике «начислено мне», и в фонде ЗП (staff).
export async function getDashboardAnalytics(
  rates: ReadonlyArray<PayrollRate>,
  opts?: { userId?: string; fixedUserIds?: ReadonlySet<string> },
): Promise<DashboardAnalytics> {
  const supabase = await createSupabaseServerClient();

  const [casesRes, paymentsRes] = await Promise.all([
    supabase
      .from('cases')
      .select(
        'id, contract_sum, opened_at, closed_at, category, lawyer_id, responsible_id, ' +
          'lawyer_rate_override, expert_rate_override',
      ),
    supabase.from('payments').select('case_id, amount, paid_at'),
  ]);
  if (casesRes.error) throw new Error(`analytics cases: ${casesRes.error.message}`);
  if (paymentsRes.error)
    throw new Error(`analytics payments: ${paymentsRes.error.message}`);

  type RawCase = {
    id: string;
    contract_sum: number | string;
    opened_at: string;
    closed_at: string | null;
    category: CaseCategory;
    lawyer_id: string;
    responsible_id: string;
    lawyer_rate_override: number | string | null;
    expert_rate_override: number | string | null;
  };
  type RawPayment = { case_id: string; amount: number | string; paid_at: string };

  const cases: AnalyticsCaseRow[] = (
    (casesRes.data ?? []) as unknown as RawCase[]
  ).map((r) => ({
    id: r.id,
    contract_sum: Number(r.contract_sum),
    opened_at: r.opened_at,
    closed_at: r.closed_at ?? null,
    category: r.category,
    lawyer_id: r.lawyer_id,
    responsible_id: r.responsible_id,
    lawyer_rate_override:
      r.lawyer_rate_override == null ? null : Number(r.lawyer_rate_override),
    expert_rate_override:
      r.expert_rate_override == null ? null : Number(r.expert_rate_override),
  }));
  const payments: AnalyticsPaymentRow[] = (
    (paymentsRes.data ?? []) as unknown as RawPayment[]
  ).map((r) => ({
    case_id: r.case_id,
    amount: Number(r.amount),
    paid_at: String(r.paid_at),
  }));

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const rateByCategory = new Map(rates.map((r) => [r.category, r]));
  const userId = opts?.userId;
  const fixedUserIds = opts?.fixedUserIds ?? new Set<string>();

  // Ставка ЗП на деле: фонд (юрист% + эксперт%) для staff; роль пользователя — для
  // специалиста. Режим salary_mode='fixed' зануляет % соответствующей роли.
  function salaryRate(c: AnalyticsCaseRow): number {
    const rate = rateByCategory.get(c.category);
    const lawyerEff = fixedUserIds.has(c.lawyer_id)
      ? 0
      : (c.lawyer_rate_override ?? rate?.lawyer_percent ?? 0);
    const expertEff = fixedUserIds.has(c.responsible_id)
      ? 0
      : (c.expert_rate_override ?? rate?.expert_percent ?? 0);
    if (!userId) return lawyerEff + expertEff;
    if (c.lawyer_id === userId) return lawyerEff;
    if (c.responsible_id === userId) return expertEff;
    return 0;
  }

  const windows = [5, 4, 3, 2, 1, 0].map((o) => kyivMonthWindow(o));
  const revenueSeries: number[] = [];
  const debtSeries: number[] = [];
  const salarySeries: number[] = [];
  const activeSeries: number[] = [];

  for (const w of windows) {
    let rev = 0;
    for (const p of payments) {
      if (p.paid_at >= w.firstISO && p.paid_at < w.nextISO) rev += p.amount;
    }
    revenueSeries.push(rev);

    // Снимки «на конец месяца» (порог d = nextISO, исключительно).
    const d = w.nextISO;
    const paidByCase = new Map<string, number>();
    let salary = 0;
    for (const p of payments) {
      if (p.paid_at < d) {
        paidByCase.set(p.case_id, (paidByCase.get(p.case_id) ?? 0) + p.amount);
        const c = caseById.get(p.case_id);
        if (c) salary += (p.amount * salaryRate(c)) / 100;
      }
    }
    salarySeries.push(salary);

    let debt = 0;
    let active = 0;
    for (const c of cases) {
      if (c.opened_at < d) {
        debt += Math.max(0, c.contract_sum - (paidByCase.get(c.id) ?? 0));
        if (c.closed_at == null || c.closed_at >= d) active += 1;
      }
    }
    debtSeries.push(debt);
    activeSeries.push(active);
  }

  const mk = (s: number[]): MetricSeries => ({
    current: s[s.length - 1] ?? 0,
    prev: s[s.length - 2] ?? 0,
    series: s,
  });

  return {
    revenue: mk(revenueSeries),
    debt: mk(debtSeries),
    salary: mk(salarySeries),
    activeCases: mk(activeSeries),
  };
}
