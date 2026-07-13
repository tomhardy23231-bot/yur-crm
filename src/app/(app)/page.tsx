import Link from 'next/link';
import {
  Plus,
  Sparkles,
  AlertTriangle,
  Briefcase,
  Wallet,
  Coins,
  TrendingDown,
} from 'lucide-react';

import { requireUser } from '@/lib/auth/require-role';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiCard, type KpiDelta } from '@/components/dashboard/kpi-card';
import { StageFunnel } from '@/components/dashboard/stage-funnel';
import { CategoryRevenue } from '@/components/dashboard/category-revenue';
import { ConversionBlock } from '@/components/dashboard/conversion-block';
import { SourcesBlock } from '@/components/dashboard/sources-block';
import { OverduePaymentsBlock } from '@/components/dashboard/overdue-payments-block';
import { DebtAgingBlock } from '@/components/dashboard/debt-aging-block';
import { RecentCases } from '@/components/dashboard/recent-cases';
import { PersonalEarnings } from '@/components/dashboard/personal-earnings';
import { MyDayBlock } from '@/components/dashboard/my-day-block';
import { UpcomingDeadlinesBlock } from '@/components/tasks/upcoming-deadlines-block';
import {
  computeConversion,
  computeDashboardStats,
  computeDelta,
  computePersonalEarnings,
  getDashboardAnalytics,
  getDashboardCases,
  getDashboardSources,
  getDebtAging,
  getFixedSalaryUserIds,
  getOverduePayments,
  type ConversionStats,
  type DashboardCaseRow,
  type MetricSeries,
} from '@/lib/dashboard/queries';
import { getPayrollRates } from '@/lib/payroll/queries';
import { listCases } from '@/lib/cases/queries';
import { listUpcomingTasks, type UpcomingTasks } from '@/lib/tasks/queries';
import { STAFF_ROLES, type Role, type TaskWithRefs } from '@/lib/types/db';
import { formatMoney } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47, type Locale } from '@/lib/i18n/config';
import type { I18n } from '@/lib/i18n/core';

// ── Хелперы дельт (бриф §3.1): фронт превращает current/prev в чип «▲/▼ + %». ──
// Цвет дельты по смыслу: для выручки рост — зелёный (хорошо), для долга рост —
// красный (плохо). neutral — когда нет однозначной «полярности».
type Polarity = 'higher-good' | 'higher-bad' | 'neutral';

function toneFor(polarity: Polarity, direction: 'up' | 'down' | 'flat'): KpiDelta['tone'] {
  if (polarity === 'neutral' || direction === 'flat') return 'neutral';
  const good = polarity === 'higher-good' ? direction === 'up' : direction === 'down';
  return good ? 'money' : 'debt';
}

function pctDelta(s: MetricSeries, polarity: Polarity, t: I18n['t']): KpiDelta {
  const d = computeDelta(s.current, s.prev);
  let text: string;
  if (d.percent == null) {
    text =
      d.direction === 'flat'
        ? '0%'
        : d.direction === 'up'
          ? t.dashboard.delta.growth
          : t.dashboard.delta.decline;
  } else {
    const r = Math.round(d.percent);
    text = `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`;
  }
  return { direction: d.direction, tone: toneFor(polarity, d.direction), text };
}

function countDelta(current: number, prev: number): KpiDelta {
  const d = computeDelta(current, prev);
  const diff = current - prev;
  const text = diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : '0';
  return { direction: d.direction, tone: 'neutral', text };
}

export default async function HomePage() {
  const user = await requireUser();
  const { t, fmt, locale } = await getT();
  const { profile } = user;
  const staff = STAFF_ROLES.includes(profile.role);

  // База для всех ролей — RLS уже ограничивает видимость по роли.
  // upcoming грузим здесь один раз: срез today → «Мой день» (над KPI),
  // просрочки/72ч → «Приближающиеся сроки» (внизу).
  const [casesResult, recentResult, upcoming] = await Promise.all([
    getDashboardCases(),
    listCases({ page: 1 }),
    listUpcomingTasks({ todayForUserId: profile.id }),
  ]);
  const { cases, truncated } = casesResult;
  const stats = computeDashboardStats(cases);
  const conversion = computeConversion(cases);
  const recent = recentResult.items.slice(0, 6);

  // U4: новичок без видимых дел получает онбординг вместо «нулевого» дашборда.
  const isEmpty = cases.length === 0;

  return (
    <main className="flex flex-col gap-5 px-4 py-4 sm:px-6">
      {!isEmpty && truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-2.5 text-[12.5px] text-warning">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
          {t.dashboard.truncatedWarning}
        </div>
      )}

      {isEmpty ? (
        <>
          <EmptyDashboard
            role={profile.role}
            name={profile.full_name}
            canCreateClient={user.caps.create_clients}
            t={t}
            fmt={fmt}
          />
          <UpcomingDeadlinesBlock data={upcoming} />
        </>
      ) : staff ? (
        <StaffDashboard
          stats={stats}
          conversion={conversion}
          recent={recent}
          todayTasks={upcoming.today}
          upcoming={upcoming}
          t={t}
          fmt={fmt}
          locale={locale}
        />
      ) : (
        <PersonalDashboard
          cases={cases}
          stats={stats}
          recent={recent}
          todayTasks={upcoming.today}
          upcoming={upcoming}
          userId={profile.id}
          t={t}
          fmt={fmt}
        />
      )}
    </main>
  );
}

// ============================================================================
// U4 — онбординг для пустого состояния (нет ни одного видимого дела).
// ============================================================================

function EmptyDashboard({
  role,
  name,
  canCreateClient,
  t,
  fmt,
}: {
  role: Role;
  name: string;
  canCreateClient: boolean;
  t: I18n['t'];
  fmt: I18n['fmt'];
}) {
  const staff = STAFF_ROLES.includes(role);
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  const message = staff
    ? t.dashboard.empty.staffMessage
    : role === 'lawyer'
      ? t.dashboard.empty.lawyerMessage
      : t.dashboard.empty.expertMessage;

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center animate-fade-in-up">
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary"
        aria-hidden="true"
      >
        <Sparkles size={26} strokeWidth={1.75} />
      </span>
      <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text">
        {fmt(t.dashboard.empty.greeting, { name: firstName })}
      </h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-text-muted">
        {message}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
        {staff && (
          <Button asChild>
            <Link href="/cases/new">
              <Plus size={16} strokeWidth={2} />
              {t.dashboard.empty.newCase}
            </Link>
          </Button>
        )}
        {canCreateClient && (
          <Button asChild variant={staff ? 'secondary' : 'primary'}>
            <Link href="/clients/new">
              <Plus size={16} strokeWidth={2} />
              {t.dashboard.empty.newClient}
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Staff (owner / admin / office_manager) — метрики компании с дельтами.
// ============================================================================

async function StaffDashboard({
  stats,
  conversion,
  recent,
  todayTasks,
  upcoming,
  t,
  fmt,
  locale,
}: {
  stats: ReturnType<typeof computeDashboardStats>;
  conversion: ConversionStats;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
  todayTasks: TaskWithRefs[];
  upcoming: UpcomingTasks;
  t: I18n['t'];
  fmt: I18n['fmt'];
  locale: Locale;
}) {
  // v3 Сессия 4: staff-серии считает SQL (RPC), ставки (rates) тут больше не нужны —
  // аналитике достаточно списка окладников (их % зануляется). v3 s7: источники —
  // независимый запрос. v3 s9: просроченные доплаты + дебиторка по давности — те же
  // RPC (SECURITY INVOKER), в один Promise.all.
  const [fixedUserIds, sources, overdue, aging] = await Promise.all([
    getFixedSalaryUserIds(),
    getDashboardSources(),
    getOverduePayments(),
    getDebtAging(),
  ]);
  const a = await getDashboardAnalytics({ fixedUserIds });
  // Подпись месяца — в часовом поясе фирмы (как и границы окна выручки).
  const monthName = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    month: 'long',
    timeZone: 'Europe/Kyiv',
  }).format(new Date());

  return (
    <>
      <section className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t.dashboard.kpi.activeCases}
          value={String(stats.activeCases)}
          context={fmt(t.dashboard.kpi.ofTotal, { total: stats.totalCases })}
          delta={countDelta(stats.activeCases, a.activeCases.prev)}
          icon={Briefcase}
          iconTone="primary"
          href="/cases"
        />
        <KpiCard
          label={t.dashboard.kpi.revenue}
          value={formatMoney(a.revenue.current)}
          unit="₴"
          context={monthName}
          delta={pctDelta(a.revenue, 'higher-good', t)}
          spark={{ points: a.revenue.series, tone: 'money' }}
          icon={Wallet}
          iconTone="primary"
          href="/reports/payroll"
        />
        <KpiCard
          label={t.dashboard.kpi.salaryFund}
          value={formatMoney(a.salary.current)}
          unit="₴"
          context={t.dashboard.kpi.salaryFundContext}
          delta={pctDelta(a.salary, 'neutral', t)}
          spark={{ points: a.salary.series, tone: 'money' }}
          icon={Coins}
          iconTone="primary"
          href="/reports/payroll"
        />
        <KpiCard
          label={t.dashboard.kpi.clientsDebt}
          value={formatMoney(stats.totalDebt)}
          unit="₴"
          valueTone="debt"
          context={fmt(t.dashboard.kpi.debtPaidContext, { paid: formatMoney(stats.totalPaid) })}
          delta={pctDelta(a.debt, 'higher-bad', t)}
          spark={{ points: a.debt.series, tone: 'debt' }}
          icon={TrendingDown}
          iconTone="primary"
          href="/cases?debt=true"
        />
      </section>

      {/* Каркас по макету владельца (2026-07-08): широкая рабочая колонка +
          узкая правая рейка. ВСЕ блоки живут внутри колонок (одна секция) —
          иначе конец короткой колонки оставлял пустую дыру до следующего ряда. */}
      <section className="grid grid-cols-1 items-start gap-5 animate-fade-in-up lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <MyDayBlock tasks={todayTasks} />
          <RecentCases items={recent} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ConversionBlock stats={conversion} />
            <CategoryRevenue data={stats.revenueByCategory} />
          </div>
          <OverduePaymentsBlock rows={overdue} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StageFunnel funnel={stats.funnel} />
          <UpcomingDeadlinesBlock data={upcoming} />
          <SourcesBlock rows={sources} />
          <DebtAgingBlock buckets={aging} />
        </div>
      </section>
    </>
  );
}

// ============================================================================
// Юрист / Эксперт — только свои дела и личные начисления (метрики компании скрыты).
// ============================================================================

async function PersonalDashboard({
  cases,
  stats,
  recent,
  todayTasks,
  upcoming,
  userId,
  t,
  fmt,
}: {
  cases: DashboardCaseRow[];
  stats: ReturnType<typeof computeDashboardStats>;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
  todayTasks: TaskWithRefs[];
  upcoming: UpcomingTasks;
  userId: string;
  t: I18n['t'];
  fmt: I18n['fmt'];
}) {
  // 4.2: справочники одним батчем — ставки (для личных начислений) + окладники.
  const [rates, fixedUserIds] = await Promise.all([
    getPayrollRates(),
    getFixedSalaryUserIds(),
  ]);
  const a = await getDashboardAnalytics({ userId, fixedUserIds });
  const earnings = computePersonalEarnings(cases, rates, userId, fixedUserIds);

  return (
    <>
      <section className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-3">
        <KpiCard
          label={t.dashboard.kpi.myActiveCases}
          value={String(stats.activeCases)}
          context={fmt(t.dashboard.kpi.ofTotal, { total: stats.totalCases })}
          delta={countDelta(stats.activeCases, a.activeCases.prev)}
          icon={Briefcase}
          iconTone="primary"
          href="/cases"
        />
        <KpiCard
          label={t.dashboard.kpi.accruedToMe}
          value={formatMoney(a.salary.current)}
          unit="₴"
          context={t.dashboard.kpi.accruedToMeContext}
          delta={pctDelta(a.salary, 'higher-good', t)}
          spark={{ points: a.salary.series, tone: 'money' }}
          icon={Coins}
          iconTone="primary"
          href="/reports/payroll"
        />
        <KpiCard
          label={t.dashboard.kpi.casesDebt}
          value={formatMoney(stats.totalDebt)}
          unit="₴"
          valueTone="debt"
          context={fmt(t.dashboard.kpi.debtPaidContext, { paid: formatMoney(stats.totalPaid) })}
          delta={pctDelta(a.debt, 'higher-bad', t)}
          spark={{ points: a.debt.series, tone: 'debt' }}
          icon={TrendingDown}
          iconTone="primary"
          href="/cases?debt=true"
        />
      </section>

      {/* Тот же двухколоночный каркас, что и у staff (макет 2026-07-08);
          все блоки внутри колонок — без пустых дыр между секциями. */}
      <section className="grid grid-cols-1 items-start gap-5 animate-fade-in-up lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <MyDayBlock tasks={todayTasks} />
          <RecentCases items={recent} />
          <PersonalEarnings earnings={earnings} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <StageFunnel funnel={stats.funnel} />
          <UpcomingDeadlinesBlock data={upcoming} />
        </div>
      </section>
    </>
  );
}
