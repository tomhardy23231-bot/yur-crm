
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getCashReportData, getUnsyncedPaymentsCount } from '@/lib/cash/queries';
import {
  buildAccountSaldo,
  buildTotalRows,
  balanceAsOf,
  monthTotals,
  entriesFromOpening,
} from '@/lib/cash/saldo';
import type { CashEntryWithCase } from '@/lib/types/db';
import { normalizeMonth, monthLabel, monthNamesFrom } from '@/lib/payroll/month';
import { MonthPicker } from '@/components/payroll/month-picker';
import { CashAccountsManager } from '@/components/cash/cash-accounts-manager';
import { CashBackfillBanner } from '@/components/cash/cash-backfill-banner';
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

  const [{ accounts, entries, openingBalances, truncated }, unsyncedCount] =
    await Promise.all([getCashReportData(month), getUnsyncedPaymentsCount()]);

  // Группируем операции МЕСЯЦА по счёту (журнал + расчёт сальдо).
  const byAccount = new Map<string, CashEntryWithCase[]>();
  for (const e of entries) {
    const list = byAccount.get(e.account_id) ?? [];
    list.push(e);
    byAccount.set(e.account_id, list);
  }

  const range = { monthStart, monthEnd };

  // Эффективный остаток на начало месяца = начальный остаток счёта + перенос из прошлых
  // периодов (cash_balances_before, SQL). Операции раньше opening_date в баланс не входят
  // (их влияние уже в opening_balance), но остаются в журнале с пометкой hasBeforeOpening.
  const openingFor = (id: string, base: number) => base + (openingBalances[id] ?? 0);

  const views: CashAccountView[] = accounts.map((acc) => {
    const accAll = byAccount.get(acc.id) ?? [];
    const accForBalance = entriesFromOpening(accAll, acc.opening_date);
    const opening = openingFor(acc.id, acc.opening_balance);
    const { rows } = buildAccountSaldo(opening, accForBalance, range);
    return {
      accountId: acc.id,
      rows,
      totals: monthTotals(rows),
      closingNow: balanceAsOf(opening, accForBalance, monthEnd),
      hasBeforeOpening: accAll.some((e) => e.entry_date < acc.opening_date),
    };
  });

  // Свод Total — по всем счетам (даже неактивным: они держат остатки).
  const totalRows = buildTotalRows(
    accounts.map((a) => ({
      id: a.id,
      openingBalance: openingFor(a.id, a.opening_balance),
      entries: entriesFromOpening(byAccount.get(a.id) ?? [], a.opening_date),
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
          {/* Заголовок — в топбаре (единый источник); здесь только описание
              периода. Редизайн Волна 2: убран дубль h1. */}
          <p className="text-[13px] text-text-muted">
            {t.cash.report.subtitle} ·{' '}
            <span className="font-medium text-text">{monthLabel(month, monthNames)}</span>
          </p>
        </div>
        <MonthPicker month={month} />
      </div>

      <CashBackfillBanner count={unsyncedCount} />

      <CashAccountsManager accounts={accounts} />

      <CashReport
        accounts={accounts}
        views={views}
        totalRows={totalRows}
        journals={journals}
        truncated={truncated}
      />
    </main>
  );
}
