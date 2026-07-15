import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dec } from '@/lib/db/convert';
import {
  rpcDashboardPaymentMonths,
  rpcDashboardSources,
  rpcDashboardStockMonths,
  rpcDebtAging,
  rpcManageUserSalaries,
  rpcOverduePlanItems,
} from '@/lib/db/rpc';
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

// RLS-видимые дела — база для KPI, воронки и личных начислений. Явный потолок
// 2000 (Phase 1) + точный count(): при усечении возвращаем truncated, дашборд
// предупреждает. Помесячные серии (выручка/долг/ЗП) считает SQL и усечению НЕ
// подвержены.
const DASHBOARD_CASES_LIMIT = 2000;

export async function getDashboardCases(): Promise<DashboardCasesResult> {
  const user = await getCurrentUser();
  if (!user) return { cases: [], truncated: false };
  const uid = user.profile.id;

  const [rows, total] = await Promise.all([
    userDb(uid, (tx) =>
      tx.cases.findMany({
        take: DASHBOARD_CASES_LIMIT,
        select: {
          id: true,
          number_title: true,
          stage: true,
          category: true,
          contract_sum: true,
          paid_total: true,
          debt: true,
          opened_at: true,
          outcome: true,
          lawyer_id: true,
          responsible_id: true,
          lawyer_rate_override: true,
          expert_rate_override: true,
        },
      }),
    ),
    userDb(uid, (tx) => tx.cases.count()),
  ]);

  const cases: DashboardCaseRow[] = rows.map((r) => ({
    id: r.id,
    number_title: r.number_title,
    stage: r.stage as CaseStage,
    category: r.category as CaseCategory,
    contract_sum: dec(r.contract_sum),
    paid_total: dec(r.paid_total),
    debt: dec(r.debt),
    opened_at: dateOnly(r.opened_at),
    outcome: r.outcome === 'lost' ? ('lost' as const) : null,
    lawyer_id: r.lawyer_id,
    responsible_id: r.responsible_id,
    lawyer_rate_override:
      r.lawyer_rate_override == null ? null : dec(r.lawyer_rate_override),
    expert_rate_override:
      r.expert_rate_override == null ? null : dec(r.expert_rate_override),
  }));

  return { cases, truncated: total > cases.length };
}

// Выручка (сумма поступивших оплат) за текущий календарный месяц.
// RLS на payments наследует видимость дела → для staff это вся компания,
// для специалиста — его дела.
export async function getRevenueThisMonth(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;

  // Границы месяца считаем по часовому поясу фирмы (Украина), а не по TZ хоста
  // (Vercel/Node работают в UTC) — иначе в ночь на 1-е число окно «съедет» на
  // день. Закрываем диапазон сверху (< next month), чтобы будущие/ошибочные
  // даты платежей не раздували KPI «выручка за месяц».
  const { year, month } = currentKyivMonth();
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const firstOfNextMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const agg = await userDb(user.profile.id, (tx) =>
    tx.payments.aggregate({
      _sum: { amount: true },
      where: {
        paid_at: {
          gte: new Date(`${firstOfMonth}T00:00:00Z`),
          lt: new Date(`${firstOfNextMonth}T00:00:00Z`),
        },
      },
    }),
  );
  return dec(agg._sum.amount);
}

// Сотрудники на окладе (salary_mode='fixed') в зоне видимости зрителя по ЗП.
// v2 Этап 4: их процентная часть зануляется в метриках дашборда (личное «начислено
// мне» и фонд ЗП). salary_mode защищён column-level привилегиями → читаем через
// SECURITY DEFINER-RPC manage_user_salaries (специалист получит лишь свою строку —
// этого достаточно для его личных метрик; staff — всех в своей зоне видимости).
export async function getFixedSalaryUserIds(): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user) return new Set<string>();

  const rows = await userDb(user.profile.id, (tx) => rpcManageUserSalaries(tx));
  const out = new Set<string>();
  for (const r of rows) {
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
// v3 Сессия 4: агрегация в SQL (RPC dashboard_payment_months +
// dashboard_stock_months, оба SECURITY INVOKER → видимость по роли работает).
// fixedUserIds (v2 Этап 4) — окладники: их % обнуляется; salary_mode приватен под
// invoker, поэтому список передаём в SQL параметром. userId задан → серии «по моей
// роли в деле», иначе фонд (юрист% + эксперт%).
export async function getDashboardAnalytics(
  opts?: { userId?: string; fixedUserIds?: ReadonlySet<string> },
): Promise<DashboardAnalytics> {
  const user = await getCurrentUser();

  // Окна от старого к новому (offset 5 → 0). from = начало самого старого окна.
  const windows = [5, 4, 3, 2, 1, 0].map((o) => kyivMonthWindow(o));
  const fromISO = windows[0]?.firstISO ?? kyivMonthWindow(5).firstISO;
  const userId = opts?.userId ?? null;
  const fixed = [...(opts?.fixedUserIds ?? new Set<string>())];

  const [revRows, stockRows] = user
    ? await Promise.all([
        userDb(user.profile.id, (tx) =>
          rpcDashboardPaymentMonths(tx, { from: fromISO }),
        ),
        userDb(user.profile.id, (tx) =>
          rpcDashboardStockMonths(tx, {
            from: fromISO,
            userId,
            fixedUserIds: fixed,
          }),
        ),
      ])
    : [[], []];

  const revByMonth = new Map<string, number>(
    revRows.map((r) => [r.month_start, r.total]),
  );
  const stockByMonth = new Map(stockRows.map((r) => [r.month_start, r]));

  // Ключ выборки — firstISO окна (= month_start строк RPC, дата первого числа).
  const revenueSeries: number[] = [];
  const debtSeries: number[] = [];
  const salarySeries: number[] = [];
  const activeSeries: number[] = [];
  for (const w of windows) {
    const s = stockByMonth.get(w.firstISO);
    revenueSeries.push(revByMonth.get(w.firstISO) ?? 0);
    debtSeries.push(s ? s.debt : 0);
    salarySeries.push(s ? s.salary : 0);
    activeSeries.push(s ? s.active_cases : 0);
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
  const user = await getCurrentUser();
  if (!user) return [];
  const { firstISO, nextISO } = kyivMonthWindow(0);

  const rows = await userDb(user.profile.id, (tx) =>
    rpcDashboardSources(tx, { from: firstISO, to: nextISO }),
  );
  return rows.map((r) => ({
    source: r.source ?? 'other',
    clients: r.clients_count,
    cases: r.cases_count,
    paid: r.paid_total,
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
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    rpcOverduePlanItems(tx, { today: kyivToday() }),
  );

  return rows
    .map((r) => {
      const amount = r.amount;
      const paidTotal = r.paid_total;
      // plan_before — накопленная сумма плана ВКЛЮЧАЯ эту позицию (= cumAfter).
      // Непокрытая часть ИМЕННО этой позиции = clamp(plan_before − paid_total, 0, amount).
      const planBefore = r.plan_before;
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
  const user = await getCurrentUser();
  if (!user) return computeAging([], kyivToday());

  const rows = await userDb(user.profile.id, (tx) => rpcDebtAging(tx));

  return computeAging(
    rows.map((r) => ({
      debt: r.debt,
      last_paid_at: r.last_paid_at,
      opened_at: r.opened_at,
    })),
    kyivToday(),
  );
}
