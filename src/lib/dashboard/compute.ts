// Чистые агрегаторы дашборда (без БД и серверных зависимостей) — выделены из
// queries.ts, чтобы покрывать юнит-тестами без 'server-only'/next-окружения.
// Данные читает queries.ts (под RLS) и передаёт сюда.
import {
  CASE_CATEGORIES,
  CASE_STAGES,
  type CaseCategory,
  type CaseOutcome,
  type CaseStage,
  type PayrollRate,
} from '@/lib/types/db';

export type DashboardCaseRow = {
  id: string;
  number_title: string;
  stage: CaseStage;
  category: CaseCategory;
  contract_sum: number;
  paid_total: number;
  debt: number;
  opened_at: string;
  // v3 s7: исход — для конверсии (lost не считается «дошедшим до договора»).
  outcome: CaseOutcome | null;
  // Нужны для расчёта личных начислений (роль пользователя в деле + override %).
  lawyer_id: string;
  responsible_id: string;
  lawyer_rate_override: number | null;
  expert_rate_override: number | null;
};

// Этапы «до контракта»: дело ещё не в работе. Дойти до in_progress+ = заключить договор.
const PRE_CONTRACT_STAGES: ReadonlyArray<CaseStage> = ['new_request', 'consultation'];

// Конверсия воронки (v3 Сессия 7). created = все дела; reached = дошедшие до
// in_progress+ (договор заключён) и НЕ lost; lost = outcome='lost' (отказ до
// контракта; их stage=closed, но «дошедшими» они не считаются). Процент = reached/created.
export type ConversionStats = {
  created: number;
  reached: number;
  lost: number;
};

export function computeConversion(
  rows: ReadonlyArray<DashboardCaseRow>,
): ConversionStats {
  let created = 0;
  let reached = 0;
  let lost = 0;
  for (const r of rows) {
    created += 1;
    if (r.outcome === 'lost') {
      lost += 1;
      continue;
    }
    if (!PRE_CONTRACT_STAGES.includes(r.stage)) reached += 1;
  }
  return { created, reached, lost };
}

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
// fixedUserIds (v2 Этап 4) — сотрудники на режиме salary_mode='fixed': для них
// процентная часть зануляется (получают оклад, % по делам не начисляется).
export function computePersonalEarnings(
  rows: ReadonlyArray<DashboardCaseRow>,
  rates: ReadonlyArray<PayrollRate>,
  userId: string,
  fixedUserIds: ReadonlySet<string> = new Set(),
): PersonalEarning[] {
  const rateByCategory = new Map<CaseCategory, PayrollRate>(
    rates.map((r) => [r.category, r]),
  );
  const isFixed = fixedUserIds.has(userId);

  return rows
    .map((r) => {
      const isLawyer = r.lawyer_id === userId;
      const role_in_case: 'lawyer' | 'expert' = isLawyer ? 'lawyer' : 'expert';
      const rate = rateByCategory.get(r.category);
      const override = isLawyer ? r.lawyer_rate_override : r.expert_rate_override;
      const categoryDefault = isLawyer
        ? (rate?.lawyer_percent ?? 0)
        : (rate?.expert_percent ?? 0);
      // Режим fixed → процент 0 (как в case_payroll / payroll_*).
      const percent = isFixed ? 0 : (override ?? categoryDefault);
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

// ============================================================================
// Аналитический слой (бриф §3.1, §8): сравнение с прошлым периодом + спарклайны.
// ============================================================================

export type MetricSeries = {
  current: number; // текущий месяц / снимок «сейчас»
  prev: number; // прошлый месяц — база для дельты
  series: number[]; // последние 6 месяцев (для спарклайна), от старого к новому
};

export type DashboardAnalytics = {
  revenue: MetricSeries; // помесячные поступления (поток)
  debt: MetricSeries; // задолженность на конец месяца (запас)
  salary: MetricSeries; // начислено: фонд (staff) либо личное (специалист)
  activeCases: MetricSeries; // открытые (не закрытые) дела на конец месяца
};

// Дельта в % и направление (бриф: фронт считает (now - prev) / prev).
// percent = null, если базы нет (prev = 0) — тогда процент не показываем.
export function computeDelta(
  current: number,
  prev: number,
): { percent: number | null; direction: 'up' | 'down' | 'flat' } {
  const direction = current > prev ? 'up' : current < prev ? 'down' : 'flat';
  if (prev === 0) return { percent: null, direction };
  return { percent: ((current - prev) / Math.abs(prev)) * 100, direction };
}
