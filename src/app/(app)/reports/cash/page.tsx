
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';

import { requireAnyCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { formatMoney, signedMoney } from '@/lib/utils';
import {
  getCashReportData,
  getCurrentBalances,
  getUnsyncedPaymentsCount,
} from '@/lib/cash/queries';
import {
  buildAccountSaldo,
  buildTotalRows,
  balanceAsOf,
  monthTotals,
  entriesFromOpening,
} from '@/lib/cash/saldo';
import type { CashEntryWithCase } from '@/lib/types/db';
import { kyivToday, monthNamesFrom } from '@/lib/payroll/month';
import {
  getExpensesByCategory,
  getProfitByCase,
  sumCategorySpend,
  sumProfit,
} from '@/lib/expenses/report';
import { listCompanyExpenses } from '@/lib/expenses/queries';
import { listActiveExpenseCategories } from '@/lib/expenses/categories';
import { periodLabel, resolvePeriod } from '@/lib/reports/period';
import {
  buildFlowDoc,
  buildIncomeDoc,
  buildRegistryDoc,
  buildSummaryDoc,
  buildTurnoverDoc,
  isIncomeDim,
} from '@/lib/reports/cash/documents';
import { PeriodPicker } from '@/components/reports/period-picker';
import { CashAccountsManager } from '@/components/cash/cash-accounts-manager';
import { CashBackfillBanner } from '@/components/cash/cash-backfill-banner';
import { CashReport, type CashAccountView } from '@/components/cash/cash-report';

export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; dim?: string }>;
}) {
  // Касса: смотреть отчёт — view_cash ИЛИ can_manage_cash (сплит 2026-07-16);
  // счета/операции/бэкфилл — только can_manage_cash. RLS дублирует.
  const user = await requireAnyCap(['view_cash', 'can_manage_cash']);
  const canManage = user.caps.can_manage_cash;
  const { t, plural } = await getT();
  const monthNames = monthNamesFrom(t.payroll);

  const sp = await searchParams;
  // Период (2026-08-03): месяц / квартал / год / произвольный. Старый
  // ?month=YYYY-MM продолжает работать — на него ведут закладки.
  const period = resolvePeriod({ from: sp.from, to: sp.to, month: sp.month });
  const monthStart = period.from;
  const monthEnd = period.to;
  const incomeDim = isIncomeDim(sp.dim) ? sp.dim : 'case';

  // Прибыльность по делам — вкладка «По делам» (миграция 0009). Тянем только
  // при праве view_case_expenses: без него вкладки нет вовсе.
  const canSeeProfit = user.caps.view_case_expenses;

  // Вкладка «Витрати» — расходы фирмы за месяц и разбивка по статьям.
  // Общефирменные расходы живут под правами кассы (в них зарплата), поэтому
  // отдельного гейта не нужно: страница уже под view_cash/can_manage_cash.
  const [
    { accounts, entries, openingBalances, truncated },
    unsyncedCount,
    profitRows,
    companyExpenses,
    categorySpend,
    expenseCategories,
    // Три отчёта за период (2026-08-03). Строятся как ReportDoc — тот же
    // документ уходит в Excel (/reports/cash/export) и в печатную версию,
    // поэтому цифры на экране и в выгрузке совпадают по построению.
    turnoverDoc,
    flowDoc,
    incomeDoc,
    summaryDoc,
    registryDoc,
  ] = await Promise.all([
    getCashReportData(period),
    getUnsyncedPaymentsCount(),
    canSeeProfit ? getProfitByCase(monthStart, monthEnd) : Promise.resolve(null),
    listCompanyExpenses(monthStart, monthEnd),
    getExpensesByCategory(monthStart, monthEnd),
    listActiveExpenseCategories('company'),
    buildTurnoverDoc(period),
    buildFlowDoc(period),
    buildIncomeDoc(period, incomeDim),
    buildSummaryDoc(period),
    buildRegistryDoc(period),
  ]);
  // Фактический остаток на сегодня — не зависит от выбранного месяца.
  const nowBalances = await getCurrentBalances();
  const profitTotals = profitRows ? sumProfit(profitRows) : undefined;
  const categorySpendTotals = sumCategorySpend(categorySpend);

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
    // Операции месяца, отсечённые датой открытия счёта (в журнале есть,
    // в оборотах и сальдо — нет). Показываем их числом, а не намёком.
    const cut = accAll.filter((e) => e.entry_date < acc.opening_date);
    const cutOff = {
      count: cut.length,
      net: cut.reduce((s2, e) => s2 + (e.direction === 'in' ? e.amount : -e.amount), 0),
    };
    const opening = openingFor(acc.id, acc.opening_balance);
    const { rows } = buildAccountSaldo(opening, accForBalance, range);
    return {
      accountId: acc.id,
      rows,
      totals: monthTotals(rows),
      closingNow: balanceAsOf(opening, accForBalance, monthEnd),
      hasBeforeOpening: accAll.some((e) => e.entry_date < acc.opening_date),
      openingDate: acc.opening_date,
      // Весь месяц раньше открытия счёта — обороты и сальдо будут нулевыми.
      monthBeforeOpening: monthEnd < acc.opening_date,
      cutOff,
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

  // Hero-полоса. Крупное число — остаток НА СЕГОДНЯ (одинаков в любом месяце),
  // рядом — остаток на конец выбранного месяца, если смотрим не текущий.
  const currentTotal = accounts.reduce(
    (s, a) => s + a.opening_balance + (nowBalances[a.id] ?? 0),
    0,
  );
  const totalBalance = views.reduce((s, v) => s + v.closingNow, 0);
  // Период закончился в прошлом — крупное число «на сегодня» надо пояснить
  // остатком на конец периода, иначе они выглядят противоречиво.
  const isCurrentMonth = period.to >= kyivToday();
  const label = periodLabel(period, monthNames, {
    quarter: t.cash.period.quarterWord,
    year: t.cash.period.yearWord,
  });
  // Ручные видатки месяца (внесены кнопкой «Видаток», без привязки к расходам
  // и платежам) — вкладка «Витрати» показывает их отдельной строкой, чтобы её
  // итог сходился с чипом «Видаток за місяць» в шапке (QA 27.07, ISSUE-002).
  const manualOutflow = entries.reduce(
    (s, e) =>
      e.direction === 'out' && e.payment_id === null && e.expense_id === null
        ? s + e.amount
        : s,
    0,
  );
  const heroInflow = views.reduce((s, v) => s + v.totals.inflow, 0);
  const heroOutflow = views.reduce((s, v) => s + v.totals.outflow, 0);
  const balancesById: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.accountId, v.closingNow]),
  );

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      {/* Компактная полоса «Общий баланс» (2026-07-25, замечание владельца: шапка
          съедала весь первый экран). Градиентный якорь оставлен, но в одну строку;
          переключатель месяца переехал сюда — отдельная строка-подпись убрана. */}
      {accounts.length > 0 ? (
        <section
          data-tour="cash-hero"
          className="relative overflow-hidden rounded-card px-4 py-3.5 sm:px-5"
          style={{ background: 'var(--grad-hero)' }}
        >
          {/* Декоративный размытый орб */}
          <div
            className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full opacity-40 blur-3xl"
            style={{ background: 'rgba(255,255,255,0.45)' }}
            aria-hidden="true"
          />

          <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Wallet size={18} strokeWidth={2} className="text-white" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/75">
                  {t.cash.report.totalBalance}
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[26px] font-bold leading-none tracking-tight text-white tabular-nums">
                  {formatMoney(currentTotal)} ₴
                  <span className="font-sans text-[11.5px] font-medium tracking-normal text-white/70">
                    {plural(t.cash.report.accountsCount, accounts.length)} · UAH
                  </span>
                </p>
                {/* Смотрим прошлый месяц — показываем и остаток на его конец,
                    иначе крупное число «на сегодня» путало бы. */}
                {!isCurrentMonth && (
                  <p className="mt-1.5 font-sans text-[11.5px] text-white/75">
                    {t.cash.report.balanceAtMonthEnd}{' '}
                    <span className="font-mono font-semibold tabular-nums text-white">
                      {formatMoney(totalBalance)} ₴
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <HeroStat
                label={t.cash.report.monthInflow}
                value={`${signedMoney(heroInflow, 'in')} ₴`}
                tone="in"
              />
              <HeroStat
                label={t.cash.report.monthOutflow}
                value={`${signedMoney(heroOutflow, 'out')} ₴`}
                tone="out"
              />
              <PeriodPicker period={period} />
            </div>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-text-muted">
            {t.cash.report.subtitle} ·{' '}
            <span className="font-medium text-text">{label}</span>
          </p>
          <PeriodPicker period={period} />
        </div>
      )}

      {canManage && (
        <CashBackfillBanner
          count={unsyncedCount}
          hasAccounts={accounts.length > 0}
        />
      )}

      <CashReport
        accounts={accounts}
        views={views}
        totalRows={totalRows}
        journals={journals}
        truncated={truncated}
        canManage={canManage}
        balances={balancesById}
        // Управление счетами — свёрнутая панель под вкладками (кнопка «Счета»):
        // остатки видны прямо во вкладках, плитки нужны только для правки.
        accountsManager={
          canManage ? (
            <CashAccountsManager accounts={accounts} balances={balancesById} />
          ) : null
        }
        profitRows={profitRows ?? undefined}
        profitTotals={profitTotals}
        companyExpenses={companyExpenses}
        expenseCategories={expenseCategories}
        categorySpend={categorySpend}
        categorySpendTotals={categorySpendTotals}
        manualOutflow={manualOutflow}
        canAddCategory={user.caps.manage_expense_categories}
        turnoverDoc={turnoverDoc}
        flowDoc={flowDoc}
        incomeDoc={incomeDoc}
        summaryDoc={summaryDoc}
        registryDoc={registryDoc}
        incomeDim={incomeDim}
        period={period}
      />
    </main>
  );
}

// Мини-стат месяца на стекле внутри полосы баланса.
function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'in' | 'out';
}) {
  const Icon = tone === 'in' ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 backdrop-blur-md">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md ${
          tone === 'in' ? 'bg-success-bg/90' : 'bg-error-bg/90'
        }`}
      >
        <Icon
          size={12}
          strokeWidth={2.5}
          className={tone === 'in' ? 'text-success-text' : 'text-error-text'}
          aria-hidden="true"
        />
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-white/80">
        {label}
      </span>
      <span className="font-mono text-[15px] font-bold leading-none text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}
