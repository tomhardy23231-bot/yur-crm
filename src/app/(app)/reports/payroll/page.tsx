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

import { cn, formatMoney, formatPercent } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { CardListShell, CardHead } from '@/components/ui/card-table';
import { ClickableCard } from '@/components/ui/clickable-card';
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
  // Сетка списка сотрудников: имя + денежные колонки + шеврон. ОДНА строка
  // для шапки, строк и итогов — колонки физически не могут разъехаться.
  const cols = `minmax(200px,1.6fr) repeat(${showFixed ? 5 : 4}, minmax(110px,1fr)) 24px`;

  return (
    // gap-3 вместо gap-5 (2026-07-25, замечание владельца о больших пробелах):
    // заголовки секций прижаты к своему содержимому через вложенные section.
    <main className="flex flex-col gap-3 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      {/* Сводные KPI-плитки месяца. Сетка по ЧИСЛУ плиток (2026-07-25): при
          трёх плитках прежние 4 колонки оставляли пустую четверть справа. */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          showFixed ? 'xl:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <KpiTile
          label={t.payroll.report.kpiBalance}
          value={`${formatMoney(totals.balance)} ₴`}
          icon={Wallet}
          iconClass="bg-primary-subtle text-primary"
          valueClass="text-primary-pressed"
        />
        {showFixed && (
          <KpiTile
            label={t.payroll.report.kpiFixed}
            value={`${formatMoney(totals.fixed)} ₴`}
            icon={Coins}
            iconClass="bg-info-bg text-info"
            valueClass="text-text"
          />
        )}
        <KpiTile
          label={t.payroll.report.kpiEarned}
          value={`${formatMoney(totals.earned)} ₴`}
          icon={TrendingUp}
          iconClass="bg-success-bg text-success"
          valueClass="text-success-text"
        />
        <KpiTile
          label={t.payroll.report.kpiBonus}
          value={`${formatMoney(totals.bonus)} ₴`}
          icon={Gift}
          iconClass="bg-warning-bg text-warning"
          valueClass="text-warning-text"
        />
      </div>

      {/* Ставки по категориям — три компактные карточки в ряд (2026-07-25).
          Прежние полосы-прогрессбары убраны: длина полосы ничего не измеряла
          (нормировка на 25%), а блок занимал треть первого экрана. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-text">{t.payroll.report.ratesTitle}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rates.map((r) => (
            <div
              key={r.category}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-sm"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: `var(--cat-${r.category})` }}
                />
                <span className="truncate text-[13px] font-medium text-text">
                  {t.enums.caseCategory[r.category]}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                {showLawyerRate && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[11px] text-text-muted">
                      {t.payroll.report.rateLawyer}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[17px] font-bold leading-none tabular-nums',
                        CAT_FG[r.category],
                      )}
                    >
                      {formatPercent(r.lawyer_percent)}%
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
                        'font-mono text-[17px] font-bold leading-none tabular-nums',
                        CAT_FG[r.category],
                      )}
                    >
                      {formatPercent(r.expert_percent)}%
                    </span>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        {showFixed && (
          <p className="text-[11.5px] leading-relaxed text-text-muted">
            {t.payroll.report.fixedNote}
          </p>
        )}
      </section>

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

        {/* Заголовок прижат к списку (одна section), а не висит отдельным
            блоком с большими отступами сверху и снизу. */}
        <section className="hidden flex-col gap-2 md:flex">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-text">
            {t.payroll.report.employeesTitle}
          </h2>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
            <Users size={14} strokeWidth={1.75} />
            {plural(t.payroll.report.employeesCount, rows.length)}
          </span>
        </div>

        {/* Список сотрудников — общий каркас списков проекта (2026-07-25,
            вместо <table>): шапка и строки делят ОДИН grid-template-columns,
            поэтому колонки не могут разъехаться. */}
        <CardListShell
          cols={cols}
          minWidth={880}
          ariaLabel={t.payroll.report.employeesTitle}
          // Потолок высоты тела: при большом штате список не растягивает
          // страницу — шапка и итоги остаются на виду (2026-07-25).
          maxBodyHeight="min(58vh, 620px)"
          footer={
            <div
              role="row"
              style={{ gridTemplateColumns: cols }}
              className="grid items-center gap-3 border-t border-border bg-surface-sunken/70 px-4 py-2.5"
            >
              <div role="cell" className="text-[13px] font-bold text-text">
                {t.payroll.report.totalLabel}
              </div>
              <Money value={totals.earned} tone="success" bold />
              {showFixed && <Money value={totals.fixed} tone="plain" bold />}
              <Money value={totals.bonus} tone="bonus" bold />
              <Money value={totals.payout} tone="success" bold />
              <Money value={totals.balance} tone="balance" bold />
              <div role="cell" />
            </div>
          }
          header={
            <>
              <CardHead>{t.payroll.report.colEmployee}</CardHead>
              <CardHead align="right">{t.payroll.report.colEarnedMonth}</CardHead>
              {showFixed && (
                <CardHead align="right">{t.payroll.report.colFixedMonth}</CardHead>
              )}
              <CardHead align="right">{t.payroll.report.colBonusMonth}</CardHead>
              <CardHead align="right">{t.payroll.report.colPaidMonth}</CardHead>
              <CardHead align="right">{t.payroll.report.colBalanceTotal}</CardHead>
              <CardHead />
            </>
          }
        >
          <div data-tour="payroll-list">
            {rows.map((r, i) => (
              <ClickableCard
                key={r.user_id}
                href={`/reports/payroll/${r.user_id}`}
                cols={cols}
                // Якорь тура: маршрут карточки первого сотрудника — в data-href.
                data-tour={i === 0 ? 'payroll-first-row' : undefined}
                data-href={`/reports/payroll/${r.user_id}`}
              >
                <div role="cell" className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={r.full_name} size="md" shape="square" />
                  <span className="truncate text-[13.5px] font-semibold text-text transition-colors group-hover:text-primary-pressed">
                    {r.full_name}
                  </span>
                </div>
                <Money value={r.earned} tone="success" />
                {showFixed && (
                  <Money
                    value={r.salary_mode !== 'percent' ? r.fixed : null}
                    tone="plain"
                  />
                )}
                <Money value={r.bonus > 0 ? r.bonus : null} tone="bonus" />
                <Money value={r.payout} tone="success" />
                <Money value={r.balance} tone="balance" />
                <div role="cell" className="text-right text-text-subtle">
                  <ChevronRight size={16} strokeWidth={1.75} />
                </div>
              </ClickableCard>
            ))}
          </div>
        </CardListShell>
        </section>
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

// Денежная ячейка списка: моно, вправо, тон по смыслу колонки. null → «—».
const MONEY_TONE = {
  success: 'text-success-text',
  bonus: 'text-warning-text',
  balance: 'text-primary-pressed',
  plain: 'text-text',
} as const;

function Money({
  value,
  tone,
  bold,
}: {
  value: number | null;
  tone: keyof typeof MONEY_TONE;
  bold?: boolean;
}) {
  return (
    <div
      role="cell"
      className={cn(
        'whitespace-nowrap text-right font-mono text-[13px] tabular-nums',
        value === null ? 'text-text-subtle' : MONEY_TONE[tone],
        bold && 'font-bold',
      )}
    >
      {value === null ? '—' : `${tone === 'bonus' && value > 0 ? '+' : ''}${formatMoney(value)} ₴`}
    </div>
  );
}

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
    // Иконка сбоку от числа, а не над ним (2026-07-25): в колоночной раскладке
    // плитка была ~90px и снизу-справа зияла пустота. Стало ~66px.
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-border hover:shadow-md">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-text-muted">{label}</p>
        <p
          className={cn(
            'mt-1 font-mono text-[22px] font-bold leading-none tracking-tight tabular-nums',
            valueClass,
          )}
        >
          {value}
        </p>
      </div>
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
  );
}
