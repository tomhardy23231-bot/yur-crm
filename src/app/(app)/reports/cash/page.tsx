
import { requireAnyCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { cn, formatMoney, signedMoney } from '@/lib/utils';
import {
  getCashCutoffSummary,
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
  rollForwardEntries,
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
    allExpenseCategories,
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
    // Карточка операции правит расход ЛЮБОГО вида (в т. ч. трату по делу),
    // поэтому ей нужен полный справочник, а не отфильтрованный под форму кассы.
    // Обе выборки идут из одного request-кэша — лишнего запроса нет.
    listActiveExpenseCategories(),
    buildTurnoverDoc(period),
    buildFlowDoc(period),
    buildIncomeDoc(period, incomeDim),
    buildSummaryDoc(period),
    buildRegistryDoc(period),
  ]);
  // Фактический остаток на сегодня — не зависит от выбранного месяца.
  // Отсечённые операции считаем по ВСЕМУ счёту (0020): перенос даты остатка —
  // настройка счёта, а не периода, и подтверждение должно показывать полную цену.
  const [nowBalances, cutoffAll] = await Promise.all([
    getCurrentBalances(),
    getCashCutoffSummary(),
  ]);
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
    // Помеченные «внести в оборот» (0019) сюда не попадают — они считаются.
    const cut = accAll.filter(
      (e) => e.entry_date < acc.opening_date && !e.include_before_opening,
    );
    // По всему счёту — это и есть настоящая цена переноса даты остатка.
    const all = cutoffAll[acc.id];
    const cutOff = {
      count: cut.length,
      net: cut.reduce((s2, e) => s2 + (e.direction === 'in' ? e.amount : -e.amount), 0),
      allCount: all?.cnt ?? 0,
      allNet: all?.net ?? 0,
      // Самая ранняя отсечённая дата СЧЁТА (не периода) — на неё предлагаем
      // перенести дату остатка: она включает в обороты сразу все такие операции.
      earliest: all?.earliest ?? null,
    };
    const opening = openingFor(acc.id, acc.opening_balance);
    const { rows } = buildAccountSaldo(opening, accForBalance, range);
    return {
      accountId: acc.id,
      rows,
      // Остаток после каждой операции — колонка «Остаток» в журнале. Считаем из
      // тех же accForBalance, что и разворот по дням, поэтому последняя операция
      // дня всегда сходится с closing этого дня.
      entryBalances: rollForwardEntries(opening, accForBalance),
      totals: monthTotals(rows),
      closingNow: balanceAsOf(opening, accForBalance, monthEnd),
      openingDate: acc.opening_date,
      // Весь период раньше открытия счёта — обороты и сальдо будут нулевыми.
      // Если хоть одна операция внесена вручную (0019), считать есть что —
      // и плашка «весь месяц до открытия» уже соврала бы.
      monthBeforeOpening: monthEnd < acc.opening_date && accForBalance.length === 0,
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
  // Отсечённые операции сюда НЕ входят: чип «Видаток за місяць» в шапке их тоже
  // не считает (он из views[].totals), и без этого условия вкладка «Витрати»
  // расходилась бы с шапкой ровно на них (ревью 0019).
  const openingByAccount = new Map(accounts.map((a) => [a.id, a.opening_date]));
  const countsInTurnover = (e: (typeof entries)[number]) =>
    e.include_before_opening || e.entry_date >= (openingByAccount.get(e.account_id) ?? '');
  const manualOutflow = entries.reduce(
    (s, e) =>
      e.direction === 'out' &&
      e.payment_id === null &&
      e.expense_id === null &&
      countsInTurnover(e)
        ? s + e.amount
        : s,
    0,
  );
  const heroInflow = views.reduce((s, v) => s + v.totals.inflow, 0);
  const heroOutflow = views.reduce((s, v) => s + v.totals.outflow, 0);
  const balancesById: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.accountId, v.closingNow]),
  );

  const heroNet = heroInflow - heroOutflow;

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      {/* Шапка каркаса «Бухгалтерия» (2026-08-03): подпись периода + селектор.
          Градиентная hero-полоса убрана — она занимала верх экрана ради одного
          числа, а остальное место отдавала декору. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-muted">
          {t.cash.report.subtitle} ·{' '}
          <span className="font-medium text-text">{label}</span>
        </p>
        <PeriodPicker period={period} />
      </div>

      {/* Итоги периода одной строкой: сколько есть, пришло, ушло, чистое
          изменение. Числа читаются слева направо, без иконок и подложек. */}
      {accounts.length > 0 && (
        <section
          data-tour="cash-hero"
          className="flex flex-wrap overflow-hidden rounded-card border border-border bg-surface shadow-sm"
        >
          <StatCell
            label={t.cash.report.statBalance}
            value={`${formatMoney(currentTotal)} ₴`}
            note={`${plural(t.cash.report.accountsCount, accounts.length)} · UAH`}
          />
          <StatCell
            label={t.cash.report.statInflow}
            value={`${signedMoney(heroInflow, 'in')} ₴`}
            tone="in"
          />
          <StatCell
            label={t.cash.report.statOutflow}
            value={`${signedMoney(heroOutflow, 'out')} ₴`}
            tone="out"
          />
          <StatCell
            label={t.cash.report.statNet}
            value={`${signedMoney(heroNet)} ₴`}
            tone={heroNet >= 0 ? 'in' : 'out'}
          />
          {/* Смотрим прошлый период — крупное «на сегодня» нужно пояснить
              остатком на его конец, иначе числа выглядят противоречиво. */}
          {!isCurrentMonth && (
            <StatCell
              label={t.cash.report.statAtPeriodEnd}
              value={`${formatMoney(totalBalance)} ₴`}
            />
          )}
        </section>
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
        canEditPayments={user.caps.edit_payments}
        canManageCaseExpenses={user.caps.manage_case_expenses}
        allCategories={allExpenseCategories}
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

// Ячейка полосы итогов: подпись сверху, число под ней. Ячейки делят строку
// поровну и разделяются hairline'ом — без карточек, чтобы полоса читалась
// как одна строка показателей, а не как четыре отдельных блока.
function StatCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  /** Подпись под числом — «3 рахунки · UAH». */
  note?: string;
  tone?: 'in' | 'out';
}) {
  return (
    <div className="min-w-[148px] flex-1 border-r border-border px-4 py-2.5 last:border-r-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-[18px] font-bold leading-none tracking-tight tabular-nums',
          tone === 'in' ? 'text-success-text' : tone === 'out' ? 'text-error' : 'text-text',
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-text-subtle">{note}</p>}
    </div>
  );
}
