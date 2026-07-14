
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';

import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/utils';
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
  const { t, plural } = await getT();
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

  // Hero-полоса «Общий баланс»: суммы из уже посчитанных views (без новых запросов).
  const totalBalance = views.reduce((s, v) => s + v.closingNow, 0);
  const heroInflow = views.reduce((s, v) => s + v.totals.inflow, 0);
  const heroOutflow = views.reduce((s, v) => s + v.totals.outflow, 0);
  const balancesById: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.accountId, v.closingNow]),
  );

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

      {/* Hero-полоса «Общий баланс» (каркас cash-page 2026-07-13): градиентный
          якорь экрана с mono-балансом и стеклянными мини-статами месяца. */}
      {accounts.length > 0 && (
        <section
          className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
          style={{ background: 'var(--grad-hero)' }}
        >
          {/* Декоративные размытые орбы */}
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
            style={{ background: 'rgba(255,255,255,0.45)' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 right-32 h-56 w-56 rounded-full opacity-30 blur-3xl"
            style={{ background: 'var(--primary-bright)' }}
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
                  <Wallet size={15} strokeWidth={2} className="text-white" aria-hidden="true" />
                </span>
                <span className="text-[12px] font-semibold uppercase tracking-wide text-white/80">
                  {t.cash.report.totalBalance}
                </span>
              </div>
              <p className="mt-3 font-mono text-[34px] font-bold leading-none tracking-tight text-white tabular-nums sm:text-[40px]">
                {formatMoney(totalBalance)} ₴
              </p>
              <p className="mt-2 text-[12.5px] text-white/75">
                {plural(t.cash.report.accountsCount, accounts.length)} · UAH
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-3">
              <div className="min-w-[128px] rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-success-bg/90">
                    <ArrowDownLeft
                      size={12}
                      strokeWidth={2.5}
                      className="text-success-text"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
                    {t.cash.report.monthInflow}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[18px] font-bold leading-none text-white tabular-nums sm:text-[20px]">
                  +{formatMoney(heroInflow)} ₴
                </p>
              </div>
              <div className="min-w-[128px] rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-error-bg/90">
                    <ArrowUpRight
                      size={12}
                      strokeWidth={2.5}
                      className="text-error-text"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
                    {t.cash.report.monthOutflow}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[18px] font-bold leading-none text-white tabular-nums sm:text-[20px]">
                  −{formatMoney(heroOutflow)} ₴
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <CashAccountsManager accounts={accounts} balances={balancesById} />

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
