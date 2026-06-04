import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';

import { requireUser } from '@/lib/auth/require-role';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KpiCard, type KpiDelta } from '@/components/dashboard/kpi-card';
import { StageFunnel } from '@/components/dashboard/stage-funnel';
import { CategoryRevenue } from '@/components/dashboard/category-revenue';
import { RecentCases } from '@/components/dashboard/recent-cases';
import { PersonalEarnings } from '@/components/dashboard/personal-earnings';
import { UpcomingDeadlinesBlock } from '@/components/tasks/upcoming-deadlines-block';
import {
  computeDashboardStats,
  computeDelta,
  computePersonalEarnings,
  getDashboardAnalytics,
  getDashboardCases,
  type MetricSeries,
} from '@/lib/dashboard/queries';
import { getPayrollRates } from '@/lib/payroll/queries';
import { listCases } from '@/lib/cases/queries';
import { STAFF_ROLES, type Role } from '@/lib/types/db';
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
  const [cases, recentResult] = await Promise.all([
    getDashboardCases(),
    listCases({ page: 1 }),
  ]);
  const stats = computeDashboardStats(cases);
  const recent = recentResult.items.slice(0, 6);

  // U4: новичок без видимых дел получает онбординг вместо «нулевого» дашборда.
  const isEmpty = cases.length === 0;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      {isEmpty ? (
        <EmptyDashboard
          role={profile.role}
          name={profile.full_name}
          canCreateClient={user.caps.create_clients}
          t={t}
          fmt={fmt}
        />
      ) : staff ? (
        <StaffDashboard stats={stats} recent={recent} t={t} fmt={fmt} locale={locale} />
      ) : (
        <PersonalDashboard
          cases={cases}
          stats={stats}
          recent={recent}
          userId={profile.id}
          t={t}
          fmt={fmt}
        />
      )}

      <UpcomingDeadlinesBlock />
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
  recent,
  t,
  fmt,
  locale,
}: {
  stats: ReturnType<typeof computeDashboardStats>;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
  t: I18n['t'];
  fmt: I18n['fmt'];
  locale: Locale;
}) {
  const rates = await getPayrollRates();
  const a = await getDashboardAnalytics(rates);
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
          href="/cases"
        />
        <KpiCard
          label={t.dashboard.kpi.revenue}
          value={formatMoney(a.revenue.current)}
          unit="₴"
          context={monthName}
          delta={pctDelta(a.revenue, 'higher-good', t)}
          spark={{ points: a.revenue.series, tone: 'money' }}
          href="/reports/payroll"
        />
        <KpiCard
          label={t.dashboard.kpi.salaryFund}
          value={formatMoney(a.salary.current)}
          unit="₴"
          context={t.dashboard.kpi.salaryFundContext}
          delta={pctDelta(a.salary, 'neutral', t)}
          spark={{ points: a.salary.series, tone: 'money' }}
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
          href="/cases?debt=true"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 animate-fade-in-up lg:grid-cols-2">
        <StageFunnel funnel={stats.funnel} />
        <CategoryRevenue data={stats.revenueByCategory} />
      </section>

      <section className="animate-fade-in-up">
        <RecentCases items={recent} funnel={stats.funnel} />
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
  userId,
  t,
  fmt,
}: {
  cases: Awaited<ReturnType<typeof getDashboardCases>>;
  stats: ReturnType<typeof computeDashboardStats>;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
  userId: string;
  t: I18n['t'];
  fmt: I18n['fmt'];
}) {
  const rates = await getPayrollRates();
  const [a, earnings] = await Promise.all([
    getDashboardAnalytics(rates, { userId }),
    Promise.resolve(computePersonalEarnings(cases, rates, userId)),
  ]);

  return (
    <>
      <section className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-3">
        <KpiCard
          label={t.dashboard.kpi.myActiveCases}
          value={String(stats.activeCases)}
          context={fmt(t.dashboard.kpi.ofTotal, { total: stats.totalCases })}
          delta={countDelta(stats.activeCases, a.activeCases.prev)}
          href="/cases"
        />
        <KpiCard
          label={t.dashboard.kpi.accruedToMe}
          value={formatMoney(a.salary.current)}
          unit="₴"
          context={t.dashboard.kpi.accruedToMeContext}
          delta={pctDelta(a.salary, 'higher-good', t)}
          spark={{ points: a.salary.series, tone: 'money' }}
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
          href="/cases?debt=true"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 animate-fade-in-up lg:grid-cols-2">
        <StageFunnel funnel={stats.funnel} />
        <RecentCases items={recent} funnel={stats.funnel} />
      </section>

      <section className="animate-fade-in-up">
        <PersonalEarnings earnings={earnings} />
      </section>
    </>
  );
}
