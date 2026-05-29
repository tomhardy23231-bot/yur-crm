import Link from 'next/link';
import { Coins, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { requireUser } from '@/lib/auth/require-role';
import {
  getPayrollRates,
  listLedger,
  listPayrollBySpecialist,
} from '@/lib/payroll/queries';
import {
  markLedgerPaidAction,
  revertLedgerPaidAction,
} from '@/lib/payroll/actions';
import {
  CASE_CATEGORY_LABEL,
  LEDGER_STATUS_LABEL,
  MANAGER_ROLES,
  STAFF_ROLES,
} from '@/lib/types/db';

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const ROLE_IN_CASE_LABEL: Record<'lawyer' | 'expert', string> = {
  lawyer: 'Юрист',
  expert: 'Эксперт',
};

export default async function PayrollReportPage() {
  const user = await requireUser();
  const isOwner = user.profile.role === 'owner';
  const canManage = MANAGER_ROLES.includes(user.profile.role);
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  // Не-staff (юрист/Експерт) видит в карточке ставок только свою колонку.
  const showLawyerRate = isStaff || user.profile.role === 'lawyer';
  const showExpertRate = isStaff || user.profile.role === 'expert';

  const [rows, rates, ledger] = await Promise.all([
    listPayrollBySpecialist(),
    getPayrollRates(),
    listLedger(),
  ]);

  const totalEarned = rows.reduce((sum, r) => sum + r.earned, 0);

  const ledgerAccrued = ledger
    .filter((l) => l.status === 'accrued')
    .reduce((s, l) => s + l.amount, 0);
  const ledgerPaid = ledger
    .filter((l) => l.status === 'paid')
    .reduce((s, l) => s + l.amount, 0);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-text-muted">
          Начисления — процент от оплаченной суммы по делу, по категории.
          Юрист и Эксперт получают полный процент каждый.
        </p>
        {isOwner && (
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/payroll">
              <Settings size={14} strokeWidth={1.75} />
              Настроить ставки
            </Link>
          </Button>
        )}
      </header>

      {/* Ставки по категориям */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Coins size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[14px] font-semibold text-text">Ставки</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {rates.map((r) => (
            <div
              key={r.category}
              className="flex flex-col gap-1 px-3 py-2 rounded-md bg-surface-muted"
            >
              <span className="text-[13px] font-medium text-text">
                {CASE_CATEGORY_LABEL[r.category]}
              </span>
              <span className="flex items-baseline gap-3 font-mono tabular-nums">
                {showLawyerRate && (
                  <span className="text-[12px] text-text-muted">
                    юрист{' '}
                    <span className="text-[14px] font-bold text-text">
                      {MONEY_FMT.format(r.lawyer_percent)}%
                    </span>
                  </span>
                )}
                {showExpertRate && (
                  <span className="text-[12px] text-text-muted">
                    эксперт{' '}
                    <span className="text-[14px] font-bold text-text">
                      {MONEY_FMT.format(r.expert_percent)}%
                    </span>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Сводка по сотрудникам */}
      {rows.length === 0 ? (
        <Card className="py-12 px-6 text-center">
          <p className="text-[14px] font-semibold text-text mb-1">
            Пока нет начислений
          </p>
          <p className="text-[13px] text-text-muted">
            Начисления появятся, когда по делам поступят оплаты.
          </p>
        </Card>
      ) : (
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Сотрудник</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead className="text-right">Дел</TableHead>
                <TableHead className="text-right">Оплачено по делам</TableHead>
                <TableHead className="text-right">Начислено</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.user_id}-${r.role_in_case}`}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={r.full_name} size="sm" />
                      <span className="text-[13px] text-text">{r.full_name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-text-muted">
                    {ROLE_IN_CASE_LABEL[r.role_in_case]}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[13px] text-text-muted">
                    {r.case_count}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums whitespace-nowrap text-[13px] text-text-muted">
                    {MONEY_FMT.format(r.paid_base)} ₴
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums whitespace-nowrap font-semibold text-success">
                    {MONEY_FMT.format(r.earned)} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-muted/50">
            <span className="text-[12px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
              Итого начислено
            </span>
            <span className="font-mono tabular-nums font-bold text-text">
              {MONEY_FMT.format(totalEarned)} ₴
            </span>
          </div>
        </div>
      )}

      {/* Леджер выплат (P1.3) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[18px] font-semibold text-text">Выплаты</h2>
          <div className="flex items-baseline gap-4 font-mono tabular-nums text-[13px]">
            <span className="text-text-muted">
              к выплате{' '}
              <span className="font-bold text-warning">
                {MONEY_FMT.format(ledgerAccrued)} ₴
              </span>
            </span>
            <span className="text-text-muted">
              выплачено{' '}
              <span className="font-bold text-success">
                {MONEY_FMT.format(ledgerPaid)} ₴
              </span>
            </span>
          </div>
        </div>

        {ledger.length === 0 ? (
          <Card className="py-10 px-6 text-center">
            <p className="text-[13px] text-text-muted">
              Начислений пока нет. Они появляются при завершении дела (или по мере
              оплат, если дело так настроено).
            </p>
          </Card>
        ) : (
          <div className="bg-surface rounded-lg border border-border shadow-sm overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-surface">
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Дело</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead className="text-right">Начислено</TableHead>
                  <TableHead>Статус</TableHead>
                  {canManage && <TableHead className="text-right">Действие</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={l.user?.full_name ?? '—'} size="sm" />
                        <span className="text-[13px] text-text">
                          {l.user?.full_name ?? '—'}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {l.case ? (
                        <Link
                          href={`/cases/${l.case.id}`}
                          className="text-[13px] text-text hover:text-primary transition-colors"
                        >
                          {l.case.number_title}
                        </Link>
                      ) : (
                        <span className="text-[13px] text-text-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-text-muted">
                      {ROLE_IN_CASE_LABEL[l.role_in_case]}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums whitespace-nowrap font-semibold text-success">
                      {MONEY_FMT.format(l.amount)} ₴
                    </TableCell>
                    <TableCell>
                      <Badge tone={l.status === 'paid' ? 'success' : 'warning'}>
                        {LEDGER_STATUS_LABEL[l.status]}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {l.status === 'paid' ? (
                          <form action={revertLedgerPaidAction}>
                            <input type="hidden" name="ledger_id" value={l.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Откатить
                            </Button>
                          </form>
                        ) : (
                          <form action={markLedgerPaidAction}>
                            <input type="hidden" name="ledger_id" value={l.id} />
                            <Button type="submit" size="sm">
                              Выплачено
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
