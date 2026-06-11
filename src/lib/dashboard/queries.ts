import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kyivMonth, kyivToday } from '@/lib/payroll/month';
import { computeAging, type AgingBuckets } from './aging';
import type {
  CaseCategory,
  CaseStage,
} from '@/lib/types/db';
import type {
  DashboardAnalytics,
  DashboardCaseRow,
  MetricSeries,
} from './compute';

// Чистые агрегаторы вынесены в ./compute (юнит-тестируемы без 'server-only').
// Реэкспортируем, чтобы существующие импорты из этого модуля продолжали работать.
export {
  computeConversion,
  computeDashboardStats,
  computeDelta,
  computePersonalEarnings,
} from './compute';
export type {
  CategoryRevenueEntry,
  ConversionStats,
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

export type DashboardCasesResult = {
  cases: DashboardCaseRow[];
  // true, если RLS-видимых дел больше, чем влезло в выборку (потолок ниже) —
  // KPI/воронка по делам неполны; дашборд покажет честное предупреждение.
  truncated: boolean;
};

// RLS-видимые дела — база для KPI, воронки и личных начислений. v3 Сессия 4:
// раньше выборка была без лимита → PostgREST (max_rows=1000) ТИХО резал её, цифры
// врали. Теперь явный потолок 2000 (Phase 1) + точный count: при усечении
// возвращаем truncated, дашборд предупреждает. Помесячные серии (выручка/долг/ЗП)
// считает SQL (getDashboardAnalytics) и усечению НЕ подвержены.
export async function getDashboardCases(): Promise<DashboardCasesResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from('cases')
    .select(
      'id, number_title, stage, category, contract_sum, paid_total, debt, opened_at, outcome, ' +
        'lawyer_id, responsible_id, lawyer_rate_override, expert_rate_override',
      { count: 'exact' },
    )
    .limit(2000);
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
    outcome: string | null;
    lawyer_id: string;
    responsible_id: string;
    lawyer_rate_override: number | string | null;
    expert_rate_override: number | string | null;
  };

  const cases = ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    category: r.category,
    contract_sum: Number(r.contract_sum),
    paid_total: Number(r.paid_total),
    debt: Number(r.debt),
    opened_at: r.opened_at,
    outcome: r.outcome === 'lost' ? ('lost' as const) : null,
    lawyer_id: r.lawyer_id,
    responsible_id: r.responsible_id,
    lawyer_rate_override:
      r.lawyer_rate_override == null ? null : Number(r.lawyer_rate_override),
    expert_rate_override:
      r.expert_rate_override == null ? null : Number(r.expert_rate_override),
  }));

  // Честный детектор усечения: всего видимых (count) больше, чем вернулось строк
  // (rows ≤ min(2000, max_rows)). Не сравниваем с 2000 буквально — реальный
  // потолок PostgREST (1000) ниже, иначе пропустили бы обрезку на 1000.
  return { cases, truncated: (count ?? cases.length) > cases.length };
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
// TZ сервера. v3 Сессия 4: единый источник «киевского месяца» — kyivMonth() в
// lib/payroll/month (не дублируем Intl-логику). Тонкая обёртка для совместимости
// с существующими вызовами этого модуля.
export function currentKyivMonth(): { year: number; month: number } {
  return kyivMonth();
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

// Считает 4 метрики за 6 последних месяцев под текущей сессией (RLS).
// v3 Сессия 4: агрегация перенесена в SQL (RPC dashboard_payment_months +
// dashboard_stock_months, оба SECURITY INVOKER → видимость по роли работает) —
// больше НЕ качаем всю историю payments/cases (потолок PostgREST 1000 искажал
// цифры). Семантика серий не изменилась (см. SQL-комментарии миграции).
// fixedUserIds (v2 Этап 4) — окладники: их % обнуляется; salary_mode приватен под
// invoker, поэтому список передаём в SQL параметром. userId задан → серии «по моей
// роли в деле», иначе фонд (юрист% + эксперт%).
export async function getDashboardAnalytics(
  opts?: { userId?: string; fixedUserIds?: ReadonlySet<string> },
): Promise<DashboardAnalytics> {
  const supabase = await createSupabaseServerClient();

  // Окна от старого к новому (offset 5 → 0). p_from = начало самого старого окна.
  const windows = [5, 4, 3, 2, 1, 0].map((o) => kyivMonthWindow(o));
  const fromISO = windows[0]?.firstISO ?? kyivMonthWindow(5).firstISO;
  const userId = opts?.userId ?? null;
  const fixed = [...(opts?.fixedUserIds ?? new Set<string>())];

  const [revRes, stockRes] = await Promise.all([
    supabase.rpc('dashboard_payment_months', { p_from: fromISO }),
    supabase.rpc('dashboard_stock_months', {
      p_from: fromISO,
      p_user_id: userId,
      p_fixed: fixed,
    }),
  ]);
  if (revRes.error) throw new Error(`analytics revenue: ${revRes.error.message}`);
  if (stockRes.error) throw new Error(`analytics stock: ${stockRes.error.message}`);

  const revByMonth = new Map<string, number>(
    (
      (revRes.data ?? []) as Array<{ month_start: string; total: number | string }>
    ).map((r) => [String(r.month_start), Number(r.total)]),
  );
  type StockRow = {
    month_start: string;
    debt: number | string;
    salary: number | string;
    active_cases: number | string;
  };
  const stockByMonth = new Map<string, StockRow>(
    ((stockRes.data ?? []) as StockRow[]).map((r) => [String(r.month_start), r]),
  );

  // Ключ выборки — firstISO окна (= month_start строк RPC, дата первого числа).
  const revenueSeries: number[] = [];
  const debtSeries: number[] = [];
  const salarySeries: number[] = [];
  const activeSeries: number[] = [];
  for (const w of windows) {
    const s = stockByMonth.get(w.firstISO);
    revenueSeries.push(revByMonth.get(w.firstISO) ?? 0);
    debtSeries.push(s ? Number(s.debt) : 0);
    salarySeries.push(s ? Number(s.salary) : 0);
    activeSeries.push(s ? Number(s.active_cases) : 0);
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

// ============================================================================
// Источники клиентов за текущий месяц (v3 Сессия 7). RPC dashboard_sources —
// SECURITY INVOKER → RLS зрителя ограничивает выдачу (staff — вся компания).
// source приходит строкой (enum-код или 'other'); локализуется в компоненте.
// ============================================================================
export type SourceRow = {
  source: string;
  clients: number;
  cases: number;
  paid: number;
};

export async function getDashboardSources(): Promise<SourceRow[]> {
  const supabase = await createSupabaseServerClient();
  const { firstISO, nextISO } = kyivMonthWindow(0);
  const { data, error } = await supabase.rpc('dashboard_sources', {
    p_from: firstISO,
    p_to: nextISO,
  });
  if (error) throw new Error(`getDashboardSources failed: ${error.message}`);
  return (
    (data ?? []) as Array<{
      source: string;
      clients_count: number | string;
      cases_count: number | string;
      paid_total: number | string;
    }>
  ).map((r) => ({
    source: r.source,
    clients: Number(r.clients_count),
    cases: Number(r.cases_count),
    paid: Number(r.paid_total),
  }));
}

// ============================================================================
// Просроченные доплаты (v3 Сессия 9). RPC overdue_plan_items — SECURITY INVOKER
// → RLS зрителя ограничивает (staff — всё, юрист/Експерт — свои). «Недооплата»
// позиции считается в TS из выданных колонок (paid_total < plan_before + amount).
// ============================================================================
export type OverduePaymentRow = {
  caseId: string;
  numberTitle: string;
  dueDate: string; // 'YYYY-MM-DD'
  shortfall: number; // непокрытая часть просроченной позиции
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function getOverduePayments(
  limit = 5,
): Promise<OverduePaymentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('overdue_plan_items', {
    p_today: kyivToday(),
  });
  if (error) throw new Error(`getOverduePayments failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    case_id: string;
    number_title: string;
    due_date: string;
    amount: number | string;
    paid_total: number | string;
    plan_before: number | string;
  }>;

  return rows
    .map((r) => {
      const amount = Number(r.amount);
      const paidTotal = Number(r.paid_total);
      // plan_before — накопленная сумма плана ВКЛЮЧАЯ эту позицию (= cumAfter).
      // Непокрытая часть ИМЕННО этой позиции = clamp(plan_before − paid_total, 0, amount).
      const planBefore = Number(r.plan_before);
      const shortfall = round2(
        Math.min(amount, Math.max(0, planBefore - paidTotal)),
      );
      return {
        caseId: r.case_id,
        numberTitle: r.number_title,
        dueDate: r.due_date,
        shortfall,
      };
    })
    // Реально недооплачена (paid_total < plan_before → shortfall > 0).
    .filter((r) => r.shortfall > 0)
    .slice(0, limit);
}

// ============================================================================
// Дебиторка по давности (v3 Сессия 9). RPC debt_aging — SECURITY INVOKER. Бакеты
// <30/30-60/60-90/90+ считает чистая функция computeAging (lib/dashboard/aging.ts)
// от coalesce(last_paid_at, opened_at) до сегодня (Киев).
// ============================================================================
export async function getDebtAging(): Promise<AgingBuckets> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('debt_aging');
  if (error) throw new Error(`getDebtAging failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    debt: number | string;
    last_paid_at: string | null;
    opened_at: string;
  }>;

  return computeAging(
    rows.map((r) => ({
      debt: Number(r.debt),
      last_paid_at: r.last_paid_at,
      opened_at: r.opened_at,
    })),
    kyivToday(),
  );
}
