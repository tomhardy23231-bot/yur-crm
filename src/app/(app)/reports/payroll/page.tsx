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
import { getT } from '@/lib/i18n/server';
import { getPayrollEmployeeSummary, getPayrollRates } from '@/lib/payroll/queries';
import { MonthPicker } from '@/components/payroll/month-picker';
import {
  normalizeMonth,
  monthLabel,
  monthNamesFrom,
  monthParam as toMonthParam,
} from '@/lib/payroll/month';

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
  const { t } = await getT();
  const monthNames = monthNamesFrom(t.payroll);
  const { month: monthParam } = await searchParams;
  const month = normalizeMonth(monthParam);
  const [subtitleBefore, subtitleAfter] = t.payroll.report.subtitle.split('{month}');

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
          <h1 className="text-[20px] font-bold text-text">{t.payroll.report.heading}</h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {subtitleBefore}
            <span className="font-medium text-text">{monthLabel(month, monthNames)}</span>
            {subtitleAfter}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Ставки по категориям */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Coins size={16} strokeWidth={1.75} className="text-text-muted" />
          <h2 className="text-[14px] font-semibold text-text">{t.payroll.report.ratesTitle}</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {rates.map((r) => (
            <div
              key={r.category}
              className="flex flex-col gap-1 rounded-md bg-surface-muted px-3 py-2"
            >
              <span className="text-[13px] font-medium text-text">
                {t.enums.caseCategory[r.category]}
              </span>
              <span className="flex items-baseline gap-3 tabular-nums">
                {showLawyerRate && (
                  <span className="text-[12px] text-text-muted">
                    {t.payroll.report.rateLawyer}{' '}
                    <span className="text-[14px] font-bold text-text">
                      {MONEY.format(r.lawyer_percent)}%
                    </span>
                  </span>
                )}
                {showExpertRate && (
                  <span className="text-[12px] text-text-muted">
                    {t.payroll.report.rateExpert}{' '}
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
            {t.payroll.report.emptyTitle}
          </p>
          <p className="text-[13px] text-text-muted">
            {t.payroll.report.emptyHint}
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
                <TableHead>{t.payroll.report.colEmployee}</TableHead>
                <TableHead className="text-right">{t.payroll.report.colEarnedMonth}</TableHead>
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
                      <Avatar name={r.full_name} size="sm" shape="square" />
                      <span className="text-[13px] font-semibold text-text">
                        {r.full_name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-text">
                    {MONEY.format(r.earned)} ₴
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-text-muted">
                    {r.bonus > 0 ? `+${MONEY.format(r.bonus)} ₴` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-success">
                    {MONEY.format(r.payout)} ₴
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] font-bold text-warning">
                    {MONEY.format(r.balance)} ₴
                  </TableCell>
                  <TableCell className="text-right text-text-subtle">
                    <ChevronRight size={16} strokeWidth={1.75} />
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-start gap-x-6 gap-y-1.5 border-t border-border bg-surface-muted/50 px-4 py-3 tabular-nums text-[13px] sm:justify-end">
            <span className="text-text-muted">
              {t.payroll.report.totalEarnedMonth}{' '}
              <span className="font-bold text-text">
                {MONEY.format(totals.earned + totals.bonus)} ₴
              </span>
            </span>
            <span className="text-text-muted">
              {t.payroll.report.totalPaidMonth}{' '}
              <span className="font-bold text-success">
                {MONEY.format(totals.payout)} ₴
              </span>
            </span>
            <span className="text-text-muted">
              {t.payroll.report.totalBalanceTotal}{' '}
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
