import {
  AlertTriangle,
  Briefcase,
  Coins,
  TrendingUp,
} from 'lucide-react';

import { requireUser } from '@/lib/auth/require-role';
import { KpiTile } from '@/components/dashboard/kpi-tile';
import { StageFunnel } from '@/components/dashboard/stage-funnel';
import { CategoryRevenue } from '@/components/dashboard/category-revenue';
import { RecentCases } from '@/components/dashboard/recent-cases';
import { PersonalEarnings } from '@/components/dashboard/personal-earnings';
import { UpcomingDeadlinesBlock } from '@/components/tasks/upcoming-deadlines-block';
import {
  computeDashboardStats,
  computePersonalEarnings,
  getDashboardCases,
  getRevenueThisMonth,
} from '@/lib/dashboard/queries';
import { getPayrollRates, listPayrollBySpecialist } from '@/lib/payroll/queries';
import { listCases } from '@/lib/cases/queries';
import { STAFF_ROLES } from '@/lib/types/db';
import { formatMoney } from '@/lib/utils';

// Подпись месяца — в часовом поясе фирмы (как и границы окна в getRevenueThisMonth).
const MONTH_FMT = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  timeZone: 'Europe/Kyiv',
});

export default async function HomePage() {
  const user = await requireUser();
  const { profile } = user;
  const staff = STAFF_ROLES.includes(profile.role);

  const firstName = profile.full_name.split(' ')[0];

  // База для всех ролей — RLS уже ограничивает видимость по роли.
  const [cases, recentResult] = await Promise.all([
    getDashboardCases(),
    listCases({ page: 1 }),
  ]);
  const stats = computeDashboardStats(cases);
  const recent = recentResult.items.slice(0, 6);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-text">
          Добрый день, {firstName}.
        </h1>
        <p className="text-[14px] text-text-muted">
          {staff
            ? 'Сводка по компании на сегодня.'
            : 'Ваши дела и начисления на сегодня.'}
        </p>
      </header>

      {staff ? (
        <StaffDashboard stats={stats} recent={recent} />
      ) : (
        <PersonalDashboard
          cases={cases}
          stats={stats}
          recent={recent}
          userId={profile.id}
        />
      )}

      <UpcomingDeadlinesBlock />
    </main>
  );
}

// ============================================================================
// Staff (owner / admin / office_manager) — метрики компании.
// ============================================================================

async function StaffDashboard({
  stats,
  recent,
}: {
  stats: ReturnType<typeof computeDashboardStats>;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
}) {
  const [monthRevenue, payroll] = await Promise.all([
    getRevenueThisMonth(),
    listPayrollBySpecialist(),
  ]);
  const payrollFund = payroll.reduce((sum, r) => sum + r.earned, 0);
  const monthName = MONTH_FMT.format(new Date());

  return (
    <>
      <section className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Активные дела"
          value={String(stats.activeCases)}
          hint={`из ${stats.totalCases} всего`}
          icon={Briefcase}
          tone="primary"
        />
        <KpiTile
          label="Выручка за месяц"
          value={`${formatMoney(monthRevenue)} ₴`}
          hint={monthName}
          icon={TrendingUp}
          tone="success"
        />
        <KpiTile
          label="Фонд зарплат"
          value={`${formatMoney(payrollFund)} ₴`}
          hint="начислено по оплатам"
          icon={Coins}
        />
        <KpiTile
          label="Задолженность клиентов"
          value={`${formatMoney(stats.totalDebt)} ₴`}
          hint={`оплачено ${formatMoney(stats.totalPaid)} ₴`}
          icon={AlertTriangle}
          tone={stats.totalDebt > 0 ? 'error' : 'default'}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 animate-fade-in-up lg:grid-cols-2">
        <StageFunnel funnel={stats.funnel} />
        <CategoryRevenue data={stats.revenueByCategory} />
      </section>

      <section className="animate-fade-in-up">
        <RecentCases items={recent} />
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
}: {
  cases: Awaited<ReturnType<typeof getDashboardCases>>;
  stats: ReturnType<typeof computeDashboardStats>;
  recent: Awaited<ReturnType<typeof listCases>>['items'];
  userId: string;
}) {
  const rates = await getPayrollRates();
  const earnings = computePersonalEarnings(cases, rates, userId);
  const totalEarned = earnings.reduce((sum, e) => sum + e.earned, 0);

  return (
    <>
      <section className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-3">
        <KpiTile
          label="Мои активные дела"
          value={String(stats.activeCases)}
          hint={`из ${stats.totalCases} всего`}
          icon={Briefcase}
          tone="primary"
        />
        <KpiTile
          label="Начислено мне"
          value={`${formatMoney(totalEarned)} ₴`}
          hint="% от оплаченного по делам"
          icon={Coins}
          tone="success"
        />
        <KpiTile
          label="Задолженность по делам"
          value={`${formatMoney(stats.totalDebt)} ₴`}
          hint={`оплачено ${formatMoney(stats.totalPaid)} ₴`}
          icon={AlertTriangle}
          tone={stats.totalDebt > 0 ? 'error' : 'default'}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 animate-fade-in-up lg:grid-cols-2">
        <StageFunnel funnel={stats.funnel} />
        <RecentCases items={recent} />
      </section>

      <section className="animate-fade-in-up">
        <PersonalEarnings earnings={earnings} />
      </section>
    </>
  );
}
