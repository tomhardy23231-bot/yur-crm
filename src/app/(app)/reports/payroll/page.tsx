import Link from 'next/link';
import {
  ChevronRight,
  Coins,
  FileText,
  Gift,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ClickableRow } from '@/components/ui/clickable-row';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getPayrollEmployeeSummary, getPayrollRates } from '@/lib/payroll/queries';
import { listActiveDepartments } from '@/lib/departments/queries';
import { canSeeAllCases } from '@/lib/types/db';
import { MonthPicker } from '@/components/payroll/month-picker';
import { PayrollDepartmentFilter } from '@/components/payroll/payroll-department-filter';
import { PayrollListMobile } from '@/components/payroll/payroll-list-mobile';
import {
  normalizeMonth,
  monthLabel,
  monthNamesFrom,
  monthParam as toMonthParam,
} from '@/lib/payroll/month';
import { UUID_RE } from '@/lib/validation';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default async function PayrollReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; department?: string }>;
}) {
  const user = await requireUser();
  const { t, plural } = await getT();
  const monthNames = monthNamesFrom(t.payroll);
  const { month: monthParam, department: departmentParam } = await searchParams;
  const month = normalizeMonth(monthParam);
  const [subtitleBefore, subtitleAfter] = t.payroll.report.subtitle.split('{month}');

  const canEditRates = user.caps.edit_payroll_rates;
  const seeAll = user.caps.view_all_payroll;
  const showLawyerRate = seeAll || user.profile.role === 'lawyer';
  const showExpertRate = seeAll || user.profile.role === 'expert';

  // Фильтр подразделения — только тем, кто видит >1 (owner / scope='all' / NULL-dept).
  const canSeeDepartments = canSeeAllCases(user.profile, user.caps);
  const departmentId =
    canSeeDepartments && departmentParam && UUID_RE.test(departmentParam)
      ? departmentParam
      : undefined;

  const [rows, rates, departments] = await Promise.all([
    getPayrollEmployeeSummary(month, departmentId),
    getPayrollRates(),
    canSeeDepartments ? listActiveDepartments() : Promise.resolve([]),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      earned: acc.earned + r.earned,
      fixed: acc.fixed + r.fixed,
      bonus: acc.bonus + r.bonus,
      payout: acc.payout + r.payout,
      balance: acc.balance + r.balance,
    }),
    { earned: 0, fixed: 0, bonus: 0, payout: 0, balance: 0 },
  );
  // Колонку «Оклад» показываем, только если у кого-то из видимых есть оклад.
  const showFixed = rows.some((r) => r.salary_mode !== 'percent');

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Заголовок страницы — в топбаре (единый источник); здесь только
              описание периода. Редизайн Волна 2: убран дубль h1. */}
          <p className="text-[13px] text-text-muted">
            {subtitleBefore}
            <span className="font-medium text-text">{monthLabel(month, monthNames)}</span>
            {subtitleAfter}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeDepartments && (
            <PayrollDepartmentFilter
              value={departmentId ?? ''}
              departments={departments}
            />
          )}
          <MonthPicker month={month} />
          {seeAll && rows.length > 0 && (
            <Button asChild size="sm">
              <Link href={`/reports/summary?month=${toMonthParam(month)}`}>
                <FileText size={14} strokeWidth={1.75} />
                {t.payroll.report.summaryReport}
              </Link>
            </Button>
          )}
          {canEditRates && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings/payroll">
                <Settings size={14} strokeWidth={1.75} />
                {t.payroll.report.configureRates}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Сводные KPI-плитки месяца (редизайн v5) — данные уже посчитаны в totals */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile
          label={t.payroll.report.kpiBalance}
          value={`${MONEY.format(totals.balance)} ₴`}
          icon={Wallet}
          iconClass="bg-primary-subtle text-primary"
          valueClass="text-primary-pressed"
        />
        {showFixed && (
          <KpiTile
            label={t.payroll.report.kpiFixed}
            value={`${MONEY.format(totals.fixed)} ₴`}
            icon={Coins}
            iconClass="bg-info-bg text-info"
            valueClass="text-text"
          />
        )}
        <KpiTile
          label={t.payroll.report.kpiEarned}
          value={`${MONEY.format(totals.earned)} ₴`}
          icon={TrendingUp}
          iconClass="bg-success-bg text-success"
          valueClass="text-success-text"
        />
        <KpiTile
          label={t.payroll.report.kpiBonus}
          value={`${MONEY.format(totals.bonus)} ₴`}
          icon={Gift}
          iconClass="bg-warning-bg text-warning"
          valueClass="text-warning-text"
        />
      </div>

      {/* Ставки по категориям — цветовые якоря категорий + полосы-визуализация */}
      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text">{t.payroll.report.ratesTitle}</h2>
        </div>
        <div className="p-5">
          <ul className="flex flex-col gap-4">
            {rates.map((r) => {
              const maxPercent = Math.max(
                showLawyerRate ? r.lawyer_percent : 0,
                showExpertRate ? r.expert_percent : 0,
              );
              // Трек нормируем на максимум дефолтных ставок (25% — представительство).
              const width = Math.min(100, (maxPercent / RATE_MAX) * 100);
              return (
                <li key={r.category} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: `var(--cat-${r.category})` }}
                      />
                      <span className="text-[13px] font-medium text-text">
                        {t.enums.caseCategory[r.category]}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-4">
                      {showLawyerRate && (
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[11px] text-text-muted">
                            {t.payroll.report.rateLawyer}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[18px] font-bold leading-none tabular-nums',
                              CAT_FG[r.category],
                            )}
                          >
                            {MONEY.format(r.lawyer_percent)}%
                          </span>
                        </span>
                      )}
                      {showExpertRate && (
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[11px] text-text-muted">
                            {t.payroll.report.rateExpert}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[18px] font-bold leading-none tabular-nums',
                              CAT_FG[r.category],
                            )}
                          >
                            {MONEY.format(r.expert_percent)}%
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{ background: `var(--cat-${r.category})`, width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {showFixed && (
            <div className="mt-5 rounded-xl bg-surface-sunken/60 p-3">
              <p className="text-[11.5px] leading-relaxed text-text-muted">
                {t.payroll.report.fixedNote}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Список сотрудников */}
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={t.payroll.report.emptyTitle}
            hint={t.payroll.report.emptyHint}
          />
        </Card>
      ) : (
        <>
        {/* Мобильное представление — карточки сотрудников вместо таблицы (6.4). */}
        <PayrollListMobile rows={rows} />

        <div
          data-tour="payroll-list"
          className="hidden overflow-auto rounded-card border border-border bg-surface shadow-sm md:block"
        >
          {/* Шапка секции: заголовок + счётчик сотрудников (каркас v5) */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold text-text">
              {t.payroll.report.employeesTitle}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
              <Users size={14} strokeWidth={1.75} />
              {plural(t.payroll.report.employeesCount, rows.length)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-sunken/50 hover:bg-surface-sunken/50">
                <TableHead>{t.payroll.report.colEmployee}</TableHead>
                <TableHead className="text-right">{t.payroll.report.colEarnedMonth}</TableHead>
                {showFixed && (
                  <TableHead className="text-right">{t.payroll.report.colFixedMonth}</TableHead>
                )}
                <TableHead className="text-right">{t.payroll.report.colBonusMonth}</TableHead>
                <TableHead className="text-right">{t.payroll.report.colPaidMonth}</TableHead>
                <TableHead className="text-right">{t.payroll.report.colBalanceTotal}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <ClickableRow
                  key={r.user_id}
                  href={`/reports/payroll/${r.user_id}`}
                  className="cursor-pointer"
                  // Якорь тура: маршрут карточки первого сотрудника читается из data-href.
                  data-tour={i === 0 ? 'payroll-first-row' : undefined}
                  data-href={`/reports/payroll/${r.user_id}`}
                >
                  <TableCell>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar name={r.full_name} size="md" shape="square" />
                      <span className="text-[13.5px] font-semibold text-text transition-colors group-hover:text-primary-pressed">
                        {r.full_name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-[13px] tabular-nums text-success-text">
                    {MONEY.format(r.earned)} ₴
                  </TableCell>
                  {showFixed && (
                    <TableCell
                      className={cn(
                        'whitespace-nowrap text-right font-mono text-[13px] tabular-nums',
                        r.salary_mode !== 'percent' ? 'text-text' : 'text-text-subtle',
                      )}
                    >
                      {r.salary_mode !== 'percent' ? `${MONEY.format(r.fixed)} ₴` : '—'}
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      'whitespace-nowrap text-right font-mono text-[13px] tabular-nums',
                      r.bonus > 0 ? 'text-warning-text' : 'text-text-subtle',
                    )}
                  >
                    {r.bonus > 0 ? `+${MONEY.format(r.bonus)} ₴` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-[13px] tabular-nums text-success-text">
                    {MONEY.format(r.payout)} ₴
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-[14px] font-bold tabular-nums text-primary-pressed">
                    {MONEY.format(r.balance)} ₴
                  </TableCell>
                  <TableCell className="text-right text-text-subtle">
                    <ChevronRight size={16} strokeWidth={1.75} />
                  </TableCell>
                </ClickableRow>
              ))}
              {/* Итоги месяца — финальный ряд таблицы, выровнен под колонками */}
              <TableRow className="bg-surface-sunken/50">
                <TableCell className="text-[13.5px] font-bold text-text">
                  {t.payroll.report.totalLabel}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-bold tabular-nums text-success-text">
                  {MONEY.format(totals.earned)} ₴
                </TableCell>
                {showFixed && (
                  <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-bold tabular-nums text-text">
                    {MONEY.format(totals.fixed)} ₴
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-bold tabular-nums text-warning-text">
                  {MONEY.format(totals.bonus)} ₴
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-bold tabular-nums text-success-text">
                  {MONEY.format(totals.payout)} ₴
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-[14px] font-bold tabular-nums text-primary-pressed">
                  {MONEY.format(totals.balance)} ₴
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </main>
  );
}

// Цвет крупного процента ставки — тёмный fg-тон категории (пары --cat-*-fg).
const CAT_FG = {
  document: 'text-cat-document-fg',
  claim: 'text-cat-claim-fg',
  representation: 'text-cat-representation-fg',
} as const;

// Нормировка трека визуализации ставок: максимум дефолтных ставок (25%).
const RATE_MAX = 25;

// Сводная KPI-плитка отчёта ЗП (каркас v5: лейбл + иконка в тинт-квадрате +
// крупное mono-число).
function KpiTile({
  label,
  value,
  icon: Icon,
  iconClass,
  valueClass,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-border hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-text-muted">{label}</p>
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            iconClass,
          )}
        >
          <Icon size={16} strokeWidth={2.2} />
        </span>
      </div>
      <p
        className={cn(
          'font-mono text-[24px] font-bold leading-none tracking-tight tabular-nums',
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}
