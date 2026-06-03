import Link from 'next/link';
import { ChevronRight, Coins, FileText, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { getPayrollEmployeeSummary, getPayrollRates } from '@/lib/payroll/queries';
import { CASE_CATEGORY_LABEL } from '@/lib/types/db';
import { MonthPicker } from '@/components/payroll/month-picker';
import { normalizeMonth, monthLabel, monthParam as toMonthParam } from '@/lib/payroll/month';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default async function PayrollReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { month: monthParam } = await searchParams;
  const month = normalizeMonth(monthParam);

  const canEditRates = user.caps.edit_payroll_rates;
  const seeAll = user.caps.view_all_payroll;
  const showLawyerRate = seeAll || user.profile.role === 'lawyer';
  const showExpertRate = seeAll || user.profile.role === 'expert';

  const [rows, rates] = await Promise.all([
    getPayrollEmployeeSummary(month),
    getPayrollRates(),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      earned: acc.earned + r.earned,
      bonus: acc.bonus + r.bonus,
      payout: acc.payout + r.payout,
      balance: acc.balance + r.balance,
    }),
    { earned: 0, bonus: 0, payout: 0, balance: 0 },
  );

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-text">Финансы и ЗП</h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            Начислено, премии и выплаты за{' '}
            <span className="font-medium text-text">{monthLabel(month)}</span>.
            «К выплате» — общий накопленный долг за всё время.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} />
          {seeAll && rows.length > 0 && (
            <Button asChild size="sm">
              <Link href={`/reports/summary?month=${toMonthParam(month)}`}>
                <FileText size={14} strokeWidth={1.75} />
                Сводный отчёт
              </Link>
            </Button>
          )}
          {canEditRates && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings/payroll">
                <Settings size={14} strokeWidth={1.75} />
                Настроить ставки
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Ставки по категориям */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Coins size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[14px] font-semibold text-text">Ставки</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {rates.map((r) => (
            <div
              key={r.category}
              className="flex flex-col gap-1 rounded-md bg-surface-muted px-3 py-2"
            >
              <span className="text-[13px] font-medium text-text">
                {CASE_CATEGORY_LABEL[r.category]}
              </span>
              <span className="flex items-baseline gap-3 font-mono tabular-nums">
                {showLawyerRate && (
                  <span className="text-[12px] text-text-muted">
                    юрист{' '}
                    <span className="text-[14px] font-bold text-text">
                      {MONEY.format(r.lawyer_percent)}%
                    </span>
                  </span>
                )}
                {showExpertRate && (
                  <span className="text-[12px] text-text-muted">
                    эксперт{' '}
                    <span className="text-[14px] font-bold text-text">
                      {MONEY.format(r.expert_percent)}%
                    </span>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Список сотрудников */}
      {rows.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="mb-1 text-[14px] font-semibold text-text">
            Пока нет данных по зарплате
          </p>
          <p className="text-[13px] text-text-muted">
            Начисления появятся, когда по делам поступят оплаты.
          </p>
        </Card>
      ) : (
        <div
          data-tour="payroll-list"
          className="overflow-auto rounded-lg border border-border bg-surface shadow-sm"
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Сотрудник</TableHead>
                <TableHead className="text-right">Начислено за месяц</TableHead>
                <TableHead className="text-right">Премии за месяц</TableHead>
                <TableHead className="text-right">Выплачено за месяц</TableHead>
                <TableHead className="text-right">К выплате (всего)</TableHead>
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
                      <Avatar name={r.full_name} size="sm" shape="square" />
                      <span className="text-[13px] font-semibold text-text">
                        {r.full_name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-text">
                    {MONEY.format(r.earned)} ₴
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-text-muted">
                    {r.bonus > 0 ? `+${MONEY.format(r.bonus)} ₴` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-success">
                    {MONEY.format(r.payout)} ₴
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] font-bold text-warning">
                    {MONEY.format(r.balance)} ₴
                  </TableCell>
                  <TableCell className="text-right text-text-subtle">
                    <ChevronRight size={16} strokeWidth={1.75} />
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-6 border-t border-border bg-surface-muted/50 px-4 py-3 font-mono tabular-nums text-[13px]">
            <span className="text-text-muted">
              начислено за месяц{' '}
              <span className="font-bold text-text">
                {MONEY.format(totals.earned + totals.bonus)} ₴
              </span>
            </span>
            <span className="text-text-muted">
              выплачено за месяц{' '}
              <span className="font-bold text-success">
                {MONEY.format(totals.payout)} ₴
              </span>
            </span>
            <span className="text-text-muted">
              к выплате всего{' '}
              <span className="font-bold text-warning">
                {MONEY.format(totals.balance)} ₴
              </span>
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
