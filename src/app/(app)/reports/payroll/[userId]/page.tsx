import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Briefcase, Coins, Gift, Wallet } from 'lucide-react';

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
import { MANAGER_ROLES, ROLE_IN_CASE_LABEL } from '@/lib/types/db';

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
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await requireUser();
  const { userId } = await params;

  const seeAll = user.caps.view_all_payroll;
  // Сотрудник видит только свою карточку; staff — любую.
  if (!seeAll && userId !== user.profile.id) redirect('/forbidden');

  const canManage = MANAGER_ROLES.includes(user.profile.role);

  const supabase = await createSupabaseServerClient();
  const [{ data: userRow }, summary, cases, transactions] = await Promise.all([
    supabase
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle<{ full_name: string }>(),
    getPayrollEmployeeSummary(),
    getPayrollEmployeeCases(userId),
    getPayrollTransactions(userId),
  ]);

  const row = summary.find((r) => r.user_id === userId);
  const fullName = userRow?.full_name ?? row?.full_name ?? 'Сотрудник';

  // Итоги.
  const earned = row?.earned ?? cases.reduce((s, c) => s + c.earned, 0);
  const bonusTotal = row?.bonus ?? 0;
  const payoutTotal = row?.payout ?? 0;
  const balance = row?.balance ?? earned + bonusTotal - payoutTotal;

  // Доля выплат, ушедшая на дела (распределённая по аллокациям) и на премии.
  const caseAllocatedTotal = cases.reduce((s, c) => s + c.paid, 0);
  const bonusPaid = Math.max(0, Math.round((payoutTotal - caseAllocatedTotal) * 100) / 100);
  const bonusOutstanding = Math.max(0, Math.round((bonusTotal - bonusPaid) * 100) / 100);
  const casesOutstanding = cases.reduce((s, c) => s + Math.max(0, c.outstanding), 0);

  // Роли сотрудника (для подзаголовка).
  const lawyerCount = cases.filter((c) => c.role_in_case === 'lawyer').length;
  const expertCount = cases.filter((c) => c.role_in_case === 'expert').length;
  const roleBits: string[] = [];
  if (lawyerCount > 0) roleBits.push(`юрист — ${lawyerCount}`);
  if (expertCount > 0) roleBits.push(`эксперт — ${expertCount}`);

  // Дела: незакрытые/с остатком — выше; затем по остатку.
  const sortedCases = [...cases].sort((a, b) => {
    const ac = a.stage === 'closed' ? 1 : 0;
    const bc = b.stage === 'closed' ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return b.outstanding - a.outstanding;
  });

  // Невыплаченные дела для модалки выплаты.
  const buckets: PayoutBucket[] = cases
    .filter((c) => c.outstanding > 0)
    .map((c) => ({
      case_id: c.case_id,
      number_title: c.number_title,
      role_in_case: c.role_in_case,
      outstanding: c.outstanding,
    }));

  // Премии (FIFO: старые гасятся первыми) + история выплат.
  const bonusTxAsc = transactions
    .filter((t) => t.kind === 'bonus')
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  // FIFO без мутации внешней переменной: для премии i выплачено = сколько из пула
  // bonusPaid осталось после погашения всех предыдущих премий.
  const bonusRows = bonusTxAsc
    .map((t, i) => {
      const before = bonusTxAsc
        .slice(0, i)
        .reduce((s, x) => s + x.amount, 0);
      const paid = Math.min(Math.max(0, bonusPaid - before), t.amount);
      return {
        ...t,
        paid: Math.round(paid * 100) / 100,
        outstanding: Math.round((t.amount - paid) * 100) / 100,
      };
    })
    .reverse(); // показываем новые сверху

  const payouts = transactions.filter((t) => t.kind === 'payout');

  return (
    <main className="flex flex-col gap-6 px-3 py-2 sm:px-4">
      <Link
        href="/reports/payroll"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} strokeWidth={1.75} />
        Ко всем сотрудникам
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
                {roleBits.join(' · ')} дел
              </p>
            )}
          </div>
        </div>
        {canManage && (
          <PayrollActions
            userId={userId}
            userName={fullName}
            buckets={buckets}
            bonusOutstanding={bonusOutstanding}
          />
        )}
      </div>

      {/* Сводка: «к выплате» крупно + разбивка */}
      <Card className="flex flex-col gap-0 overflow-hidden sm:flex-row sm:items-stretch sm:divide-x sm:divide-border">
        <div className="flex flex-col justify-center gap-1 bg-warning-bg/40 px-6 py-5 sm:w-[34%]">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-muted">
            <Wallet size={13} strokeWidth={2} />К выплате сейчас
          </span>
          <span className="font-mono text-[30px] font-extrabold leading-none tabular-nums text-warning">
            {MONEY.format(balance)} ₴
          </span>
          <span className="text-[12px] text-text-muted">
            дела {MONEY.format(casesOutstanding)} ₴ · премии{' '}
            {MONEY.format(bonusOutstanding)} ₴
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 divide-x divide-border">
          <SummaryCell
            label="Заработано за дела"
            value={`${MONEY.format(earned)} ₴`}
            tone="text"
          />
          <SummaryCell
            label="Премии начислено"
            value={`${bonusTotal > 0 ? '+' : ''}${MONEY.format(bonusTotal)} ₴`}
            tone="muted"
          />
          <SummaryCell
            label="Выплачено всего"
            value={`${MONEY.format(payoutTotal)} ₴`}
            tone="success"
            caption={`дела ${MONEY.format(caseAllocatedTotal)} · премии ${MONEY.format(bonusPaid)}`}
          />
        </div>
      </Card>

      {/* Дела */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[16px] font-semibold text-text">Заработок по делам</h2>
          <span className="text-[12.5px] text-text-subtle">
            {cases.length} {cases.length === 1 ? 'дело' : 'дел'}
          </span>
        </div>
        {cases.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-[13px] text-text-muted">
              Сотрудник пока не назначен ни на одно дело.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дело</TableHead>
                  <TableHead>Этап</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead className="text-right">Заработано</TableHead>
                  <TableHead className="min-w-32">Выплата</TableHead>
                  <TableHead className="text-right">Осталось</TableHead>
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
                        {ROLE_IN_CASE_LABEL[c.role_in_case]} · {MONEY.format(c.percent)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono text-[13px] font-semibold tabular-nums text-text">
                          {MONEY.format(c.earned)} ₴
                        </div>
                        <div className="text-[11px] text-text-subtle">
                          {MONEY.format(c.percent)}% от {MONEY.format(c.paid_total)} ₴
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
                              <span className="font-medium text-success">Выплачено</span>
                            ) : partially ? (
                              <>выплачено {MONEY.format(c.paid)} ₴</>
                            ) : c.earned > 0 ? (
                              'не выплачено'
                            ) : (
                              '—'
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
            <h2 className="text-[16px] font-semibold text-text">Премии</h2>
          </div>
          {bonusTotal > 0 && (
            <div className="flex items-baseline gap-4 font-mono text-[12.5px] tabular-nums">
              <span className="text-text-muted">
                начислено{' '}
                <span className="font-semibold text-text">
                  {MONEY.format(bonusTotal)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                выплачено{' '}
                <span className="font-semibold text-success">
                  {MONEY.format(bonusPaid)} ₴
                </span>
              </span>
              <span className="text-text-muted">
                осталось{' '}
                <span className="font-semibold text-warning">
                  {MONEY.format(bonusOutstanding)} ₴
                </span>
              </span>
            </div>
          )}
        </div>
        {bonusRows.length === 0 ? (
          <Card className="px-6 py-8 text-center">
            <p className="text-[13px] text-text-muted">
              Премий пока нет. Кнопка «Премия» — начислить бонус сверх заработка по делам.
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
                      <Badge tone="success">выплачено</Badge>
                    ) : b.paid > 0 ? (
                      <Badge tone="warning">
                        выплачено {MONEY.format(b.paid)} из {MONEY.format(b.amount)} ₴
                      </Badge>
                    ) : (
                      <Badge tone="neutral">не выплачено</Badge>
                    )}
                  </div>
                  {b.comment && (
                    <p className="mt-0.5 text-[13px] text-text">{b.comment}</p>
                  )}
                </div>
                {canManage && (
                  <DeleteTransactionButton
                    transactionId={b.id}
                    label={`Премия ${MONEY.format(b.amount)} ₴`}
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
          <h2 className="text-[16px] font-semibold text-text">История выплат</h2>
        </div>
        {payouts.length === 0 ? (
          <Card className="px-6 py-8 text-center">
            <p className="text-[13px] text-text-muted">
              Выплат пока нет. Кнопка «Выплата» — отметить, что выдали сотруднику (за
              дела и/или премии).
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((t) => {
              const allocSum = t.allocations.reduce((s, a) => s + a.amount, 0);
              const bonusPortion = Math.round((t.amount - allocSum) * 100) / 100;
              return (
                <li
                  key={t.id}
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
                        −{MONEY.format(t.amount)} ₴
                      </span>
                      <span className="text-[12px] text-text-muted">
                        {formatDate(t.occurred_on)}
                      </span>
                    </div>
                    {t.comment && (
                      <p className="mt-0.5 text-[13px] text-text">{t.comment}</p>
                    )}
                    {(t.allocations.length > 0 || bonusPortion > 0.001) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {t.allocations.map((a) => (
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
                            премии
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
                      transactionId={t.id}
                      label={`Выплата ${MONEY.format(t.amount)} ₴`}
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
