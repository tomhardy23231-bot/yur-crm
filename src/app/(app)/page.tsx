import Link from 'next/link';
import {
  AlertTriangle,
  Briefcase,
  Coins,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { requireUser } from '@/lib/auth/require-role';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { canCreateClients, STAFF_ROLES, type Role } from '@/lib/types/db';
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

  // База для всех ролей — RLS уже ограничивает видимость по роли.
  const [cases, recentResult] = await Promise.all([
    getDashboardCases(),
    listCases({ page: 1 }),
  ]);
  const stats = computeDashboardStats(cases);
  const recent = recentResult.items.slice(0, 6);

  // U4: новичок без видимых дел получает онбординг вместо «нулевого» дашборда
  // (KPI/воронка/таблицы были бы пустыми и выглядели как поломка).
  const isEmpty = cases.length === 0;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      {isEmpty ? (
        <EmptyDashboard role={profile.role} name={profile.full_name} />
      ) : staff ? (
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
// U4 — онбординг для пустого состояния (нет ни одного видимого дела).
// Текст и действия зависят от роли: staff заводит дело, юрист — клиента,
// эксперт ждёт назначения.
// ============================================================================

function EmptyDashboard({ role, name }: { role: Role; name: string }) {
  const staff = STAFF_ROLES.includes(role);
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  const message = staff
    ? 'Здесь появится сводка по делам, финансам и срокам. Заведите клиента и создайте первое дело — дашборд оживёт.'
    : role === 'lawyer'
      ? 'За вами пока нет дел. Заведите клиента или дождитесь, пока вас назначат на дело.'
      : 'За вами пока нет дел. Они появятся здесь, как только вас назначат экспертом по делу.';

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center animate-fade-in-up">
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary"
        aria-hidden="true"
      >
        <Sparkles size={26} strokeWidth={1.75} />
      </span>
      <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text">
        Добро пожаловать, {firstName}!
      </h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-text-muted">
        {message}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
        {staff && (
          <Button asChild>
            <Link href="/cases/new">
              <Plus size={16} strokeWidth={2} />
              Новое дело
            </Link>
          </Button>
        )}
        {canCreateClients(role) && (
          <Button asChild variant={staff ? 'secondary' : 'primary'}>
            <Link href="/clients/new">
              <Plus size={16} strokeWidth={2} />
              Новый клиент
            </Link>
          </Button>
        )}
      </div>
    </Card>
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
