import { Wallet } from 'lucide-react';

import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getCashReportData } from '@/lib/cash/queries';
import {
  buildAccountSaldo,
  buildTotalRows,
  balanceAsOf,
  monthTotals,
  type CashRawEntry,
} from '@/lib/cash/saldo';
import { normalizeMonth, monthLabel, monthNamesFrom } from '@/lib/payroll/month';
import { MonthPicker } from '@/components/payroll/month-picker';
import { CashAccountsManager } from '@/components/cash/cash-accounts-manager';
import { CashReport, type CashAccountView } from '@/components/cash/cash-report';

// Последний день месяца 'YYYY-MM-01' → 'YYYY-MM-DD' (UTC, без таймзонного сдвига).
function lastDayOfMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)); // 1-based
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Касса — только обладателю права can_manage_cash (по дефолту owner). RLS дублирует.
  await requireCap('can_manage_cash');
  const { t } = await getT();
  const monthNames = monthNamesFrom(t.payroll);

  const { month: monthParam } = await searchParams;
  const month = normalizeMonth(monthParam); // 'YYYY-MM-01'
  const monthStart = month;
  const monthEnd = lastDayOfMonth(month);

  const { accounts, entries } = await getCashReportData(month);

  // Группируем операции по счёту (нужны до конца месяца — для переноса остатка).
  const byAccount = new Map<string, CashRawEntry[]>();
  for (const e of entries) {
    const list = byAccount.get(e.account_id) ?? [];
    list.push(e);
    byAccount.set(e.account_id, list);
  }

  const range = { monthStart, monthEnd };

  const views: CashAccountView[] = accounts.map((acc) => {
    const accEntries = byAccount.get(acc.id) ?? [];
    const { rows } = buildAccountSaldo(acc.opening_balance, accEntries, range);
    return {
      accountId: acc.id,
      rows,
      totals: monthTotals(rows),
      closingNow: balanceAsOf(acc.opening_balance, accEntries, monthEnd),
      hasBeforeOpening: accEntries.some((e) => e.entry_date < acc.opening_date),
    };
  });

  // Свод Total — по всем счетам (даже неактивным: они держат остатки).
  const totalRows = buildTotalRows(
    accounts.map((a) => ({
      id: a.id,
      openingBalance: a.opening_balance,
      entries: byAccount.get(a.id) ?? [],
    })),
    range,
  );

  // Журнал операций месяца по счёту (для списка с возможностью удаления ручных).
  const journals: Record<string, typeof entries> = {};
  for (const acc of accounts) {
    journals[acc.id] = entries.filter(
      (e) => e.account_id === acc.id && e.entry_date >= monthStart && e.entry_date <= monthEnd,
    );
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-[20px] font-bold text-text">
            <Wallet size={20} strokeWidth={1.75} className="text-text-muted" />
            {t.cash.report.heading}
          </h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {t.cash.report.subtitle} ·{' '}
            <span className="font-medium text-text">{monthLabel(month, monthNames)}</span>
          </p>
        </div>
        <MonthPicker month={month} />
      </div>

      <CashAccountsManager accounts={accounts} />

      <CashReport
        accounts={accounts}
        views={views}
        totalRows={totalRows}
        journals={journals}
      />
    </main>
  );
}
