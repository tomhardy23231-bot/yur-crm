import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  Coins,
  FileText,
  Gift,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StageBadge } from '@/components/ui/stage-badge';
import { CardListShell, CardHead } from '@/components/ui/card-table';
import { ClickableCard } from '@/components/ui/clickable-card';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { cn, formatMoney, formatPercent } from '@/lib/utils';
import { userDb } from '@/lib/db';
import {
  getPayrollEmployeeCases,
  getPayrollEmployeeSummary,
  getPayrollTransactions,
} from '@/lib/payroll/queries';
import {
  PayrollActions,
  DeleteTransactionButton,
  type PayoutBucket,
} from '@/components/payroll/payroll-actions';
import { MonthPicker } from '@/components/payroll/month-picker';
import {
  normalizeMonth,
  monthLabel,
  monthNamesFrom,
  monthParam,
  nextMonth,
} from '@/lib/payroll/month';
import { listAbsencesByUser } from '@/lib/absences/queries';
import { canManageAbsencesOf } from '@/lib/absences/access';
import { AbsencesBlock } from '@/components/absences/absences-block';
import { MANAGER_ROLES } from '@/lib/types/db';

// occurred_on приходит как 'YYYY-MM-DD' — форматируем без таймзонных сдвигов.
function formatDate(s: string): string {
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

export default async function PayrollEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { t, fmt, plural } = await getT();
  const monthNames = monthNamesFrom(t.payroll);
  const { userId } = await params;
  const { month: monthRaw } = await searchParams;
  const month = normalizeMonth(monthRaw);
  const monthEnd = nextMonth(month);

  const seeAll = user.caps.view_all_payroll;
  // Сотрудник видит только свою карточку; staff — любую.
  if (!seeAll && userId !== user.profile.id) redirect('/forbidden');

  const canManage = MANAGER_ROLES.includes(user.profile.role);

  // За месяц — для цифр секций; за всё время — для накопленного долга и модалки выплаты.
  const [userRow, summary, monthCases, allCases, monthTx, allTx, absences] =
    await Promise.all([
      userDb(user.profile.id, (tx) =>
        tx.public_users.findUnique({
          where: { id: userId },
          select: { full_name: true, department_id: true },
        }),
      ),
      getPayrollEmployeeSummary(month),
      getPayrollEmployeeCases(userId, month),
      getPayrollEmployeeCases(userId),
      getPayrollTransactions(userId, month),
      getPayrollTransactions(userId),
      listAbsencesByUser(userId),
    ]);

  // Может ли зритель вносить/удалять отсутствия этого сотрудника (зеркало RLS
  // absence_can_write): сам / owner / admin своего подразделения.
  const canManageAbsences = canManageAbsencesOf(
    {
      id: user.profile.id,
      role: user.profile.role,
      department_id: user.profile.department_id,
      visibility_scope: user.profile.visibility_scope,
    },
    { id: userId, department_id: userRow?.department_id ?? null },
  );

  const row = summary.find((r) => r.user_id === userId);
  const fullName = userRow?.full_name ?? row?.full_name ?? t.payroll.employee.fallbackName;

  // Итоги ЗА МЕСЯЦ (из сводки).
  const earnedMonth = row?.earned ?? monthCases.reduce((s, c) => s + c.earned, 0);
  const bonusMonth = row?.bonus ?? 0;
  const payoutMonth = row?.payout ?? 0;
  // Накопленный общий долг (за всё время) — «К выплате сейчас».
  const balance = row?.balance ?? 0;

  // Режим зарплаты и оклад (v2 Этап 4). Оклад — справочно за месяц, в balance не входит.
  const salaryMode = row?.salary_mode ?? 'percent';
  const fixedMonthly = row?.fixed ?? 0;

  // Накопленные разбивки (за всё время) — для карточки долга и модалки выплаты.
  const caseAllocatedAll = allCases.reduce((s, c) => s + c.paid, 0);
  const payoutTotalAll = allTx
    .filter((t) => t.kind === 'payout')
    .reduce((s, t) => s + t.amount, 0);
  const bonusTotalAll = allTx
    .filter((t) => t.kind === 'bonus')
    .reduce((s, t) => s + t.amount, 0);
  const bonusPaidAll = Math.max(0, Math.round((payoutTotalAll - caseAllocatedAll) * 100) / 100);
  const bonusOutstandingAll = Math.max(0, Math.round((bonusTotalAll - bonusPaidAll) * 100) / 100);
  const casesOutstandingAll = allCases.reduce((s, c) => s + Math.max(0, c.outstanding), 0);

  // Месячная разбивка выплаты (подпись ячейки «Выплачено за месяц»).
  const monthCaseAllocated = monthCases.reduce((s, c) => s + c.paid, 0);
  const monthBonusPaid = Math.max(0, Math.round((payoutMonth - monthCaseAllocated) * 100) / 100);

  // Роли сотрудника (по всем делам, не только за месяц). 'dual' (0007) —
  // совмещение: человек в деле и юрист, и Експерт — считаем в обе роли.
  const lawyerCount = allCases.filter(
    (c) => c.role_in_case === 'lawyer' || c.role_in_case === 'dual',
  ).length;
  const expertCount = allCases.filter(
    (c) => c.role_in_case === 'expert' || c.role_in_case === 'dual',
  ).length;
  const roleBits: string[] = [];
  if (lawyerCount > 0) roleBits.push(fmt(t.payroll.employee.rolesLawyer, { count: lawyerCount }));
  if (expertCount > 0) roleBits.push(fmt(t.payroll.employee.rolesExpert, { count: expertCount }));

  // Дела за месяц: только те, по которым в этом месяце были оплаты (есть начисление).
  // Закрытые ниже, затем по убыванию начисления.
  const monthCasesShown = monthCases.filter((c) => c.paid_total > 0 || c.earned > 0);
  const sortedCases = [...monthCasesShown].sort((a, b) => {
    const ac = a.stage === 'closed' ? 1 : 0;
    const bc = b.stage === 'closed' ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return b.earned - a.earned;
  });

  // Невыплаченные дела для модалки выплаты — по НАКОПЛЕННОМУ остатку (за всё время).
  const buckets: PayoutBucket[] = allCases
    .filter((c) => c.outstanding > 0)
    .map((c) => ({
      case_id: c.case_id,
      number_title: c.number_title,
      role_in_case: c.role_in_case,
      outstanding: c.outstanding,
    }));

  // Премии: статус «выплачено» (FIFO, старые гасятся первыми) считаем по ВСЕМ премиям
  // накопленно, а показываем только премии выбранного месяца.
  const bonusTxAsc = allTx
    .filter((t) => t.kind === 'bonus')
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const bonusRows = bonusTxAsc
    .map((t, i) => {
      const before = bonusTxAsc.slice(0, i).reduce((s, x) => s + x.amount, 0);
      const paid = Math.min(Math.max(0, bonusPaidAll - before), t.amount);
      return {
        ...t,
        paid: Math.round(paid * 100) / 100,
        outstanding: Math.round((t.amount - paid) * 100) / 100,
      };
    })
    .filter((t) => t.occurred_on >= month && t.occurred_on < monthEnd)
    .reverse(); // показываем новые сверху

  // Итоги секции «Премии» за месяц.
  const bonusMonthPaid = bonusRows.reduce((s, b) => s + b.paid, 0);
  const bonusMonthOutstanding = bonusRows.reduce((s, b) => s + b.outstanding, 0);

  const payouts = monthTx.filter((t) => t.kind === 'payout');

  // Итоги подвала списка дел за месяц.
  const caseTotals = sortedCases.reduce(
    (a, c) => ({
      earned: a.earned + c.earned,
      paid: a.paid + Math.max(0, c.paid),
      outstanding: a.outstanding + Math.max(0, c.outstanding),
    }),
    { earned: 0, paid: 0, outstanding: 0 },
  );

  return (
    // Перебор каркаса 2026-07-25 (владелец: «сделать красиво и современно»):
    // шапка в одну строку, сводка — плитки, дела — сеточный список, пустые
    // секции — узкие полосы вместо огромных белых карточек. Ритм gap-3.
    <main className="flex flex-col gap-3 px-3 py-2 sm:px-4">
      {/* Шапка сотрудника: возврат + аватар + имя слева, период и действия справа */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/reports/payroll"
            aria-label={t.payroll.employee.backToAll}
            title={t.payroll.employee.backToAll}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </Link>
          <Avatar name={fullName} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-bold leading-tight text-text">
              {fullName}
            </h1>
            {roleBits.length > 0 && (
              <p className="truncate text-[12.5px] text-text-muted">
                {roleBits.join(' · ')} {t.payroll.employee.rolesSuffix}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} />
          <Button asChild variant="secondary" size="sm">
            <Link href={`/reports/employee/${userId}?month=${monthParam(month)}`}>
              <FileText size={14} strokeWidth={1.75} />
              {t.payroll.employee.buildReport}
            </Link>
          </Button>
          {canManage && (
            <div data-tour="payroll-actions">
              <PayrollActions
                userId={userId}
                userName={fullName}
                buckets={buckets}
                bonusOutstanding={bonusOutstandingAll}
              />
            </div>
          )}
        </div>
      </div>

      {/* Оклад (v2 Этап 4) — показывается для режимов fixed / fixed_percent */}
      {salaryMode !== 'percent' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
            <Wallet size={15} strokeWidth={1.75} className="text-text-muted" />
            {t.payroll.employee.salaryTitle}:{' '}
            <span className="font-mono tabular-nums">
              {fmt(t.payroll.employee.salaryPerMonth, { amount: formatMoney(fixedMonthly) })}
            </span>
          </span>
          <span className="text-[12.5px] text-text-muted">
            {fmt(t.payroll.employee.salaryMode, { mode: t.enums.salaryMode[salaryMode] })}
          </span>
          <span className="text-[12px] text-text-subtle">{t.payroll.employee.salaryNote}</span>
        </div>
      )}

      {/* Сводка — четыре равные плитки (было: одна широкая карточка, разбитая
          на неравные ячейки; левая треть тонировалась и «ломала» полосу). */}
      <div
        data-tour="payroll-summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryTile
          label={t.payroll.employee.toPayNow}
          value={`${formatMoney(balance)} ₴`}
          caption={fmt(t.payroll.employee.toPayBreakdown, {
            cases: formatMoney(casesOutstandingAll),
            bonus: formatMoney(bonusOutstandingAll),
          })}
          icon={Wallet}
          tone="accent"
        />
        <SummaryTile
          label={t.payroll.employee.earnedMonth}
          value={`${formatMoney(earnedMonth)} ₴`}
          icon={Briefcase}
          tone="plain"
        />
        <SummaryTile
          label={t.payroll.employee.bonusMonth}
          value={`${bonusMonth > 0 ? '+' : ''}${formatMoney(bonusMonth)} ₴`}
          icon={Gift}
          tone={bonusMonth > 0 ? 'bonus' : 'muted'}
        />
        <SummaryTile
          label={t.payroll.employee.paidMonth}
          value={`${formatMoney(payoutMonth)} ₴`}
          caption={fmt(t.payroll.employee.paidMonthCaption, {
            cases: formatMoney(monthCaseAllocated),
            bonus: formatMoney(monthBonusPaid),
          })}
          icon={Coins}
          tone="success"
        />
      </div>

      {/* Дела — сеточный список (общий каркас проекта). Колонка-прогрессбар
          убрана: при невыплаченных делах это была пустая серая полоса на
          четверть ширины. Вместо неё — чип статуса с суммой. */}
      <section data-tour="payroll-cases" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Briefcase size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[15px] font-semibold text-text">
            {fmt(t.payroll.employee.casesTitle, { month: monthLabel(month, monthNames) })}
          </h2>
          <span className="text-[12.5px] text-text-subtle">
            {plural(t.payroll.employee.casesCount, monthCasesShown.length)}
          </span>
        </div>
        {monthCasesShown.length === 0 ? (
          <EmptyStrip
            icon={Briefcase}
            text={fmt(t.payroll.employee.casesEmpty, { month: monthLabel(month, monthNames) })}
          />
        ) : (
          <CardListShell
            cols={CASE_COLS}
            minWidth={860}
            ariaLabel={t.payroll.employee.casesTitle}
            // Потолок высоты: при 100 делах за месяц список не растягивает
            // страницу — строки скроллятся внутри блока (замечание владельца).
            maxBodyHeight="min(52vh, 560px)"
            footer={
              <div
                role="row"
                style={{ gridTemplateColumns: CASE_COLS }}
                className="grid items-center gap-3 border-t border-border bg-surface-sunken/70 px-4 py-2.5"
              >
                <div role="cell" className="text-[13px] font-bold text-text">
                  {t.payroll.report.totalLabel}
                </div>
                <div role="cell" />
                <div role="cell" />
                <div role="cell" className="text-right font-mono text-[13px] font-bold tabular-nums text-text">
                  {formatMoney(caseTotals.earned)} ₴
                </div>
                <div role="cell" className="text-right font-mono text-[13px] font-bold tabular-nums text-success-text">
                  {formatMoney(caseTotals.paid)} ₴
                </div>
                <div role="cell" className="text-right font-mono text-[13px] font-bold tabular-nums text-warning">
                  {formatMoney(caseTotals.outstanding)} ₴
                </div>
              </div>
            }
            header={
              <>
                <CardHead>{t.payroll.employee.colCase}</CardHead>
                <CardHead>{t.payroll.employee.colStage}</CardHead>
                <CardHead>{t.payroll.employee.colRole}</CardHead>
                <CardHead align="right">{t.payroll.employee.colEarned}</CardHead>
                <CardHead align="right">{t.payroll.employee.colPayout}</CardHead>
                <CardHead align="right">{t.payroll.employee.colRemaining}</CardHead>
              </>
            }
          >
            {sortedCases.map((c) => {
              const fullyPaid = c.earned > 0 && c.outstanding <= 0.001;
              const partially = c.paid > 0 && !fullyPaid;
              return (
                <ClickableCard
                  key={`${c.case_id}-${c.role_in_case}`}
                  href={`/cases/${c.case_id}`}
                  cols={CASE_COLS}
                >
                  <div role="cell" className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-text transition-colors group-hover:text-primary-pressed">
                      {c.number_title}
                    </span>
                  </div>
                  <div role="cell">
                    <StageBadge stage={c.stage} pulse={false} />
                  </div>
                  <div role="cell" className="truncate text-[12.5px] text-text-muted">
                    {t.enums.roleInCase[c.role_in_case]} · {formatPercent(c.percent)}%
                  </div>
                  <div role="cell" className="text-right">
                    <div className="font-mono text-[13px] font-semibold tabular-nums text-text">
                      {formatMoney(c.earned)} ₴
                    </div>
                    <div className="text-[11px] text-text-subtle">
                      {fmt(t.payroll.employee.earnedFrom, {
                        percent: formatPercent(c.percent),
                        paid: formatMoney(c.paid_total),
                      })}
                    </div>
                  </div>
                  <div role="cell" className="flex justify-end">
                    {fullyPaid ? (
                      <Badge tone="success">{t.payroll.employee.statusPaid}</Badge>
                    ) : partially ? (
                      <Badge tone="warning">
                        {fmt(t.payroll.employee.statusPartial, {
                          amount: formatMoney(c.paid),
                        })}
                      </Badge>
                    ) : c.earned > 0 ? (
                      <Badge tone="neutral">{t.payroll.employee.statusUnpaid}</Badge>
                    ) : (
                      <span className="text-[12.5px] text-text-subtle">{t.common.dash}</span>
                    )}
                  </div>
                  <div
                    role="cell"
                    className={cn(
                      'whitespace-nowrap text-right font-mono text-[13px] font-semibold tabular-nums',
                      c.outstanding > 0.001 ? 'text-warning' : 'text-text-subtle',
                    )}
                  >
                    {formatMoney(Math.max(0, c.outstanding))} ₴
                  </div>
                </ClickableCard>
              );
            })}
          </CardListShell>
        )}
      </section>

      {/* Премии */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gift size={16} strokeWidth={1.75} className="text-text-muted" />
            <h2 className="text-[15px] font-semibold text-text">
              {fmt(t.payroll.employee.bonusesTitle, { month: monthLabel(month, monthNames) })}
            </h2>
          </div>
          {bonusMonth > 0 && (
            <div className="flex items-baseline gap-4 text-[12.5px] tabular-nums">
              <span className="text-text-muted">
                {t.payroll.employee.bonusAccrued}{' '}
                <span className="font-semibold text-text">
                  {formatMoney(bonusMonth)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                {t.payroll.employee.bonusPaid}{' '}
                <span className="font-semibold text-success">
                  {formatMoney(bonusMonthPaid)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                {t.payroll.employee.bonusRemaining}{' '}
                <span className="font-semibold text-warning">
                  {formatMoney(bonusMonthOutstanding)} ₴
                </span>
              </span>
            </div>
          )}
        </div>
        {bonusRows.length === 0 ? (
          <EmptyStrip
            icon={Gift}
            text={fmt(t.payroll.employee.bonusesEmpty, { month: monthLabel(month, monthNames) })}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {bonusRows.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
              >
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning"
                  aria-hidden="true"
                >
                  <Gift size={15} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[14px] font-bold tabular-nums text-text">
                      +{formatMoney(b.amount)} ₴
                    </span>
                    <span className="text-[12px] text-text-muted">
                      {formatDate(b.occurred_on)}
                    </span>
                    {b.outstanding <= 0.001 ? (
                      <Badge tone="success">{t.payroll.employee.badgePaid}</Badge>
                    ) : b.paid > 0 ? (
                      <Badge tone="warning">
                        {fmt(t.payroll.employee.badgePartial, {
                          paid: formatMoney(b.paid),
                          amount: formatMoney(b.amount),
                        })}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t.payroll.employee.badgeUnpaid}</Badge>
                    )}
                  </div>
                  {b.comment && (
                    <p className="mt-0.5 text-[13px] text-text">{b.comment}</p>
                  )}
                </div>
                {canManage && (
                  <DeleteTransactionButton
                    transactionId={b.id}
                    label={fmt(t.payroll.employee.bonusLabel, { amount: formatMoney(b.amount) })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* История выплат */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Coins size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[15px] font-semibold text-text">
            {fmt(t.payroll.employee.payoutsTitle, { month: monthLabel(month, monthNames) })}
          </h2>
        </div>
        {payouts.length === 0 ? (
          <EmptyStrip
            icon={Coins}
            text={fmt(t.payroll.employee.payoutsEmpty, { month: monthLabel(month, monthNames) })}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((tx) => {
              const allocSum = tx.allocations.reduce((s, a) => s + a.amount, 0);
              const bonusPortion = Math.round((tx.amount - allocSum) * 100) / 100;
              return (
                <li
                  key={tx.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
                >
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-bg text-success"
                    aria-hidden="true"
                  >
                    <Coins size={15} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[14px] font-bold tabular-nums text-text">
                        −{formatMoney(tx.amount)} ₴
                      </span>
                      <span className="text-[12px] text-text-muted">
                        {formatDate(tx.occurred_on)}
                      </span>
                    </div>
                    {tx.comment && (
                      <p className="mt-0.5 text-[13px] text-text">{tx.comment}</p>
                    )}
                    {(tx.allocations.length > 0 || bonusPortion > 0.001) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tx.allocations.map((a) => (
                          <Link
                            key={`${a.case_id}-${a.role_in_case}`}
                            href={`/cases/${a.case_id}`}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11.5px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
                          >
                            {a.number_title}
                            <span className="tabular-nums">
                              {formatMoney(a.amount)} ₴
                            </span>
                          </Link>
                        ))}
                        {bonusPortion > 0.001 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-bg px-2 py-0.5 text-[11.5px] font-medium text-warning">
                            <Gift size={11} strokeWidth={2} />
                            {t.payroll.employee.payoutBonusChip}
                            <span className="tabular-nums">
                              {formatMoney(bonusPortion)} ₴
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <DeleteTransactionButton
                      transactionId={tx.id}
                      label={fmt(t.payroll.employee.payoutLabel, { amount: formatMoney(tx.amount) })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Отпуска / отсутствия (v2 Этап 6) */}
      <AbsencesBlock userId={userId} absences={absences} canManage={canManageAbsences} />
    </main>
  );
}

// Сетка списка дел сотрудника: справа · этап · роль · заработок · выплата ·
// остаток. Общая для шапки, строк и подвала — колонки не разъезжаются.
// Доли колонок близки друг к другу — иначе слева (номер дела — короткая дата)
// оставалась дыра в треть экрана, а деньги жались к правому краю.
const CASE_COLS =
  'minmax(110px,0.9fr) minmax(140px,1fr) minmax(110px,0.9fr) minmax(140px,1.1fr) minmax(140px,1fr) minmax(110px,0.9fr)';

// Плитка сводки: подпись + число + иконка сбоку (высота ~66px). Тон «accent» —
// главный показатель «К выплате сейчас».
const TILE_TONE = {
  accent: {
    box: 'border-warning/35 bg-warning-bg/45',
    value: 'text-warning',
    icon: 'bg-warning-bg text-warning',
  },
  success: { box: '', value: 'text-success-text', icon: 'bg-success-bg text-success' },
  bonus: { box: '', value: 'text-warning-text', icon: 'bg-warning-bg text-warning' },
  plain: { box: '', value: 'text-text', icon: 'bg-primary-subtle text-primary' },
  muted: { box: '', value: 'text-text-muted', icon: 'bg-surface-sunken text-text-muted' },
} as const;

function SummaryTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
  tone: keyof typeof TILE_TONE;
}) {
  const s = TILE_TONE[tone];
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-sm',
        s.box,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-text-muted">{label}</p>
        <p
          className={cn(
            'mt-1 font-mono text-[21px] font-bold leading-none tracking-tight tabular-nums',
            s.value,
          )}
        >
          {value}
        </p>
        {caption && (
          <p className="mt-1 truncate text-[11px] text-text-subtle">{caption}</p>
        )}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          s.icon,
        )}
      >
        <Icon size={16} strokeWidth={2.2} />
      </span>
    </div>
  );
}

// Пустая секция — узкая полоса вместо карточки в 100px высотой с одной
// строчкой текста по центру (замечание владельца 2026-07-25).
function EmptyStrip({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-card border border-dashed border-border bg-surface/60 px-4 py-3">
      <Icon size={15} strokeWidth={1.75} className="shrink-0 text-text-subtle" aria-hidden="true" />
      <p className="text-[12.5px] text-text-muted">{text}</p>
    </div>
  );
}
