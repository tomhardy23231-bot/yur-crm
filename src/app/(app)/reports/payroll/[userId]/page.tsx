import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Briefcase, Coins, FileText, Gift, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StageBadge } from '@/components/ui/stage-badge';
import { PaymentProgress } from '@/components/cases/payment-progress';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
import { MANAGER_ROLES } from '@/lib/types/db';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

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

  const supabase = await createSupabaseServerClient();
  // За месяц — для цифр секций; за всё время — для накопленного долга и модалки выплаты.
  const [{ data: userRow }, summary, monthCases, allCases, monthTx, allTx] =
    await Promise.all([
      supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle<{ full_name: string }>(),
      getPayrollEmployeeSummary(month),
      getPayrollEmployeeCases(userId, month),
      getPayrollEmployeeCases(userId),
      getPayrollTransactions(userId, month),
      getPayrollTransactions(userId),
    ]);

  const row = summary.find((r) => r.user_id === userId);
  const fullName = userRow?.full_name ?? row?.full_name ?? t.payroll.employee.fallbackName;

  // Итоги ЗА МЕСЯЦ (из сводки).
  const earnedMonth = row?.earned ?? monthCases.reduce((s, c) => s + c.earned, 0);
  const bonusMonth = row?.bonus ?? 0;
  const payoutMonth = row?.payout ?? 0;
  // Накопленный общий долг (за всё время) — «К выплате сейчас».
  const balance = row?.balance ?? 0;

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

  // Роли сотрудника (по всем делам, не только за месяц).
  const lawyerCount = allCases.filter((c) => c.role_in_case === 'lawyer').length;
  const expertCount = allCases.filter((c) => c.role_in_case === 'expert').length;
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

  return (
    <main className="flex flex-col gap-6 px-3 py-2 sm:px-4">
      <Link
        href="/reports/payroll"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} strokeWidth={1.75} />
        {t.payroll.employee.backToAll}
      </Link>

      {/* Шапка сотрудника */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={fullName} size="lg" />
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-text">
              {fullName}
            </h1>
            {roleBits.length > 0 && (
              <p className="text-[12.5px] text-text-muted">
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

      {/* Сводка: «к выплате» крупно + разбивка */}
      <Card
        data-tour="payroll-summary"
        className="flex flex-col gap-0 overflow-hidden sm:flex-row sm:items-stretch sm:divide-x sm:divide-border"
      >
        <div className="flex flex-col justify-center gap-1 bg-warning-bg/40 px-6 py-5 sm:w-[34%]">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-muted">
            <Wallet size={13} strokeWidth={2} />{t.payroll.employee.toPayNow}
          </span>
          <span className="font-mono text-[30px] font-extrabold leading-none tabular-nums text-warning">
            {MONEY.format(balance)} ₴
          </span>
          <span className="text-[12px] text-text-muted">
            {fmt(t.payroll.employee.toPayBreakdown, {
              cases: MONEY.format(casesOutstandingAll),
              bonus: MONEY.format(bonusOutstandingAll),
            })}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 divide-x divide-border">
          <SummaryCell
            label={t.payroll.employee.earnedMonth}
            value={`${MONEY.format(earnedMonth)} ₴`}
            tone="text"
          />
          <SummaryCell
            label={t.payroll.employee.bonusMonth}
            value={`${bonusMonth > 0 ? '+' : ''}${MONEY.format(bonusMonth)} ₴`}
            tone="muted"
          />
          <SummaryCell
            label={t.payroll.employee.paidMonth}
            value={`${MONEY.format(payoutMonth)} ₴`}
            tone="success"
            caption={fmt(t.payroll.employee.paidMonthCaption, {
              cases: MONEY.format(monthCaseAllocated),
              bonus: MONEY.format(monthBonusPaid),
            })}
          />
        </div>
      </Card>

      {/* Дела */}
      <section data-tour="payroll-cases" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[16px] font-semibold text-text">
            {fmt(t.payroll.employee.casesTitle, { month: monthLabel(month, monthNames) })}
          </h2>
          <span className="text-[12.5px] text-text-subtle">
            {plural(t.payroll.employee.casesCount, monthCasesShown.length)}
          </span>
        </div>
        {monthCasesShown.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-[13px] text-text-muted">
              {fmt(t.payroll.employee.casesEmpty, { month: monthLabel(month, monthNames) })}
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.payroll.employee.colCase}</TableHead>
                  <TableHead>{t.payroll.employee.colStage}</TableHead>
                  <TableHead>{t.payroll.employee.colRole}</TableHead>
                  <TableHead className="text-right">{t.payroll.employee.colEarned}</TableHead>
                  <TableHead className="min-w-32">{t.payroll.employee.colPayout}</TableHead>
                  <TableHead className="text-right">{t.payroll.employee.colRemaining}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCases.map((c) => {
                  const fullyPaid = c.earned > 0 && c.outstanding <= 0.001;
                  const partially = c.paid > 0 && !fullyPaid;
                  return (
                    <TableRow key={`${c.case_id}-${c.role_in_case}`}>
                      <TableCell>
                        <Link
                          href={`/cases/${c.case_id}`}
                          className="text-[13px] font-medium text-text transition-colors hover:text-primary"
                        >
                          {c.number_title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={c.stage} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12.5px] text-text-muted">
                        {t.enums.roleInCase[c.role_in_case]} · {MONEY.format(c.percent)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono text-[13px] font-semibold tabular-nums text-text">
                          {MONEY.format(c.earned)} ₴
                        </div>
                        <div className="text-[11px] text-text-subtle">
                          {fmt(t.payroll.employee.earnedFrom, {
                            percent: MONEY.format(c.percent),
                            paid: MONEY.format(c.paid_total),
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <PaymentProgress
                            paid={Math.max(0, c.paid)}
                            total={Math.max(c.earned, 0.01)}
                            className="w-full"
                          />
                          <span className="text-[11px] text-text-subtle">
                            {fullyPaid ? (
                              <span className="font-medium text-success">
                                {t.payroll.employee.statusPaid}
                              </span>
                            ) : partially ? (
                              <>{fmt(t.payroll.employee.statusPartial, { amount: MONEY.format(c.paid) })}</>
                            ) : c.earned > 0 ? (
                              t.payroll.employee.statusUnpaid
                            ) : (
                              t.common.dash
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'whitespace-nowrap text-right font-mono text-[13px] font-semibold tabular-nums',
                          c.outstanding > 0.001 ? 'text-warning' : 'text-text-subtle',
                        )}
                      >
                        {MONEY.format(Math.max(0, c.outstanding))} ₴
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Премии */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gift size={16} strokeWidth={1.75} className="text-text-muted" />
            <h2 className="text-[16px] font-semibold text-text">
              {fmt(t.payroll.employee.bonusesTitle, { month: monthLabel(month, monthNames) })}
            </h2>
          </div>
          {bonusMonth > 0 && (
            <div className="flex items-baseline gap-4 font-mono text-[12.5px] tabular-nums">
              <span className="text-text-muted">
                {t.payroll.employee.bonusAccrued}{' '}
                <span className="font-semibold text-text">
                  {MONEY.format(bonusMonth)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                {t.payroll.employee.bonusPaid}{' '}
                <span className="font-semibold text-success">
                  {MONEY.format(bonusMonthPaid)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                {t.payroll.employee.bonusRemaining}{' '}
                <span className="font-semibold text-warning">
                  {MONEY.format(bonusMonthOutstanding)} ₴
                </span>
              </span>
            </div>
          )}
        </div>
        {bonusRows.length === 0 ? (
          <Card className="px-6 py-8 text-center">
            <p className="text-[13px] text-text-muted">
              {fmt(t.payroll.employee.bonusesEmpty, { month: monthLabel(month, monthNames) })}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {bonusRows.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
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
                      +{MONEY.format(b.amount)} ₴
                    </span>
                    <span className="text-[12px] text-text-muted">
                      {formatDate(b.occurred_on)}
                    </span>
                    {b.outstanding <= 0.001 ? (
                      <Badge tone="success">{t.payroll.employee.badgePaid}</Badge>
                    ) : b.paid > 0 ? (
                      <Badge tone="warning">
                        {fmt(t.payroll.employee.badgePartial, {
                          paid: MONEY.format(b.paid),
                          amount: MONEY.format(b.amount),
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
                    label={fmt(t.payroll.employee.bonusLabel, { amount: MONEY.format(b.amount) })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* История выплат */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Coins size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[16px] font-semibold text-text">
            {fmt(t.payroll.employee.payoutsTitle, { month: monthLabel(month, monthNames) })}
          </h2>
        </div>
        {payouts.length === 0 ? (
          <Card className="px-6 py-8 text-center">
            <p className="text-[13px] text-text-muted">
              {fmt(t.payroll.employee.payoutsEmpty, { month: monthLabel(month, monthNames) })}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((tx) => {
              const allocSum = tx.allocations.reduce((s, a) => s + a.amount, 0);
              const bonusPortion = Math.round((tx.amount - allocSum) * 100) / 100;
              return (
                <li
                  key={tx.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
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
                        −{MONEY.format(tx.amount)} ₴
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
                            <span className="font-mono tabular-nums">
                              {MONEY.format(a.amount)} ₴
                            </span>
                          </Link>
                        ))}
                        {bonusPortion > 0.001 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-bg px-2 py-0.5 text-[11.5px] font-medium text-warning">
                            <Gift size={11} strokeWidth={2} />
                            {t.payroll.employee.payoutBonusChip}
                            <span className="font-mono tabular-nums">
                              {MONEY.format(bonusPortion)} ₴
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <DeleteTransactionButton
                      transactionId={tx.id}
                      label={fmt(t.payroll.employee.payoutLabel, { amount: MONEY.format(tx.amount) })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function SummaryCell({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: string;
  tone: 'text' | 'muted' | 'success';
  caption?: string;
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'muted'
        ? 'text-text-muted'
        : 'text-text';
  return (
    <div className="flex flex-col justify-center gap-1 px-5 py-4">
      <span className="text-[11px] uppercase tracking-[0.04em] text-text-muted">
        {label}
      </span>
      <span className={cn('font-mono text-[18px] font-bold tabular-nums', color)}>
        {value}
      </span>
      {caption && (
        <span className="text-[11px] text-text-subtle">{caption}</span>
      )}
    </div>
  );
}
