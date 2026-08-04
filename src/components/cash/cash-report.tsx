'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Trash2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownUp,
  ArrowUpRight,
  CalendarClock,
  Link2,
  Wallet,
} from 'lucide-react';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { cn, formatMoney, signedMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccount, CashEntryWithCase } from '@/lib/types/db';
import type { CashDayRow, CashMonthTotals, CashTotalRow } from '@/lib/cash/saldo';
import {
  deleteCashEntryAction,
  shiftAccountOpeningDateAction,
} from '@/lib/cash/actions';
import type {
  CategorySpendRow,
  CategorySpendTotals,
  ProfitRow,
  ProfitTotals,
} from '@/lib/expenses/report';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { ExpenseWithRefs } from '@/lib/types/db';
import type { ReportDoc } from '@/lib/reports/export/types';
import type { Period } from '@/lib/reports/period';
import type { CashIncomeDim } from '@/lib/db/rpc';
import { AddExpenseDialog } from '@/components/expenses/add-expense-dialog';
import { CashEntryDetailsDialog } from './cash-entry-details-dialog';
import { CashEntryDialog } from './cash-entry-dialog';
import { CashExpensesPanel } from './cash-expenses-panel';
import { CashProfitPanel } from './cash-profit-panel';
import { CashRail, type RailGroup } from './cash-rail';
import { CashReportPanel } from './cash-report-panel';

export type CashAccountView = {
  accountId: string;
  rows: CashDayRow[];
  totals: CashMonthTotals;
  closingNow: number;
  /** Дата открытия счёта — 'YYYY-MM-DD' (для пояснения пустого месяца). */
  openingDate: string;
  /** Весь выбранный месяц раньше даты открытия счёта: сальдо и обороты = 0. */
  monthBeforeOpening: boolean;
  /**
   * Операции, отсечённые датой открытия счёта: они видны в журнале, но в обороты
   * и сальдо не входят. Без явной цифры это выглядело как ошибка расчёта
   * (2026-07-26: таблица показывала +27 000, журнал — 30 операций).
   *
   * count/net — по ВИДИМОМУ периоду (это то, что человек видит на экране);
   * allCount/allNet/earliest — по ВСЕМУ счёту (0020). Перенос даты остатка —
   * настройка счёта, поэтому подтверждение обязано показывать полную цену, а
   * не ту часть, что попала в открытый месяц.
   */
  cutOff: {
    count: number;
    net: number;
    allCount: number;
    allNet: number;
    /** Самая ранняя отсечённая дата СЧЁТА — на неё предлагаем перенести остаток. */
    earliest: string | null;
  };
  /**
   * Накопительный остаток счёта ПОСЛЕ каждой операции периода (entryId → остаток).
   * Журнал показывает его колонкой «Остаток»: сумму операции видно и так, а вот
   * состояние счёта после неё раньше приходилось считать в уме. Операций раньше
   * opening_date здесь нет — они в сальдо не входят (в журнале будет прочерк).
   */
  entryBalances: Record<string, number>;
};

const TOTAL_TAB = '__total__';
// Управление счетами — такой же раздел рейки, а не кнопка-раскрывашка в шапке
// (каркас «Бухгалтерия», 2026-08-03): настройка счетов живёт там же, где сами счета.
const ACCOUNTS_TAB = '__accounts__';
// Вкладка «По делам» — прибыльность (дохід/витрати/маржа). Живёт здесь, а не
// отдельным пунктом меню: владелец (2026-07-24) — «всё про деньги в одном месте».
const PROFIT_TAB = '__profit__';
// Вкладка «Витрати» — расходы фирмы + разбивка по статьям (2026-07-26,
// требование клиента «понимать куда сколько ушло»).
const EXPENSES_TAB = '__expenses__';
// Отчёты за период (2026-08-03): оборотно-сальдовая, движение по месяцам,
// доходы. Живут теми же вкладками — «всё про деньги в одном месте».
const TURNOVER_TAB = '__turnover__';
const FLOW_TAB = '__flow__';
const INCOME_TAB = '__income__';
const SUMMARY_TAB = '__summary__';
const REGISTRY_TAB = '__registry__';

function money(n: number): string {
  return `${formatMoney(n)} ₴`;
}

export function CashReport({
  accounts,
  views,
  totalRows,
  journals,
  truncated = false,
  canManage = true,
  balances = {},
  accountsManager = null,
  profitRows,
  profitTotals,
  companyExpenses,
  expenseCategories = [],
  categorySpend,
  categorySpendTotals,
  canAddCategory = false,
  canEditPayments = false,
  canManageCaseExpenses = false,
  allCategories = [],
  manualOutflow = 0,
  turnoverDoc,
  flowDoc,
  incomeDoc,
  summaryDoc,
  registryDoc,
  incomeDim = 'case',
  period,
}: {
  accounts: CashAccount[];
  views: CashAccountView[];
  totalRows: CashTotalRow[];
  journals: Record<string, CashEntryWithCase[]>;
  truncated?: boolean;
  // Право can_manage_cash (сплит 2026-07-16): false — режим «только смотрю»
  // (view_cash), без формы добавления и удаления ручных операций.
  canManage?: boolean;
  /** Текущий остаток по счёту (accountId → closingNow) — показывается прямо во вкладке. */
  balances?: Record<string, number>;
  // Панель управления счетами (плитки + формы). Свёрнута по умолчанию — раскрывается
  // кнопкой в строке вкладок (2026-07-25: шапка занимала весь первый экран).
  // null — нет права can_manage_cash.
  accountsManager?: React.ReactNode;
  // Прибыльность по делам. undefined — нет права view_case_expenses,
  // вкладку «По делам» не показываем вовсе.
  profitRows?: ProfitRow[];
  profitTotals?: ProfitTotals;
  // Расходы фирмы за месяц + разбивка по статьям. undefined — нет доступа
  // (вкладку не показываем вовсе).
  companyExpenses?: ExpenseWithRefs[];
  expenseCategories?: ExpenseCategoryOption[];
  categorySpend?: CategorySpendRow[];
  categorySpendTotals?: CategorySpendTotals;
  /** Право заводить статьи «на лету» (manage_expense_categories). */
  canAddCategory?: boolean;
  /** Право edit_payments — правка платежа из карточки операции журнала. */
  canEditPayments?: boolean;
  /** Право manage_case_expenses — правка расхода ПО ДЕЛУ из карточки операции. */
  canManageCaseExpenses?: boolean;
  /**
   * ВСЕ активные статьи (и «в делах», и «по фирме») — карточка операции правит
   * расход любого вида, а `expenseCategories` отфильтрованы под форму кассы.
   */
  allCategories?: ExpenseCategoryOption[];
  /** Ручные видатки каси за месяц — примиряют вкладку «Витрати» с шапкой. */
  manualOutflow?: number;
  // Отчёты за период (2026-08-03). Готовые документы: тот же ReportDoc уходит
  // в Excel и в печатную версию, поэтому цифры совпадают по построению.
  turnoverDoc?: ReportDoc;
  flowDoc?: ReportDoc;
  incomeDoc?: ReportDoc;
  summaryDoc?: ReportDoc;
  registryDoc?: ReportDoc;
  /** Активный разрез вкладки «Доходы» — живёт в URL как ?dim=. */
  incomeDim?: CashIncomeDim;
  /** Выбранный период — нужен ссылкам экспорта и печати. */
  period?: Period;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startShift] = useTransition();

  // Раздел живёт в URL (?tab=) — ссылку на «оборотку за квартал» можно переслать.
  // Переключение при этом НЕ ходит на сервер: все данные разделов уже пришли
  // пропсами, поэтому состояние держим локально, а адресную строку правим
  // history.replaceState. router.push здесь означал бы полный ре-рендер страницы
  // (11 запросов в Promise.all) ради переключения вкладки.
  const known = new Set<string>([
    ...accounts.map((a) => a.id),
    TOTAL_TAB,
    ACCOUNTS_TAB,
    EXPENSES_TAB,
    PROFIT_TAB,
    TURNOVER_TAB,
    FLOW_TAB,
    INCOME_TAB,
    SUMMARY_TAB,
    REGISTRY_TAB,
  ]);
  const fromUrl = searchParams.get('tab');
  const [tab, setTab] = useState<string>(
    fromUrl && known.has(fromUrl) ? fromUrl : (accounts[0]?.id ?? TOTAL_TAB),
  );

  const selectTab = (id: string) => {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  };

  // Перенос даты начального остатка (2026-08-04) — через ПОДТВЕРЖДЕНИЕ с
  // цифрами. Действие меняет отчётные суммы за всю историю счёта: остаток
  // остаётся прежним числом, но отсечённые операции начинают считаться поверх
  // него. Если они на самом деле УЖЕ внутри остатка, деньги задвоятся —
  // проверить это может только владелец, поэтому решение показываем в суммах,
  // а не в словах (ревью 0019).
  const [shiftTarget, setShiftTarget] = useState<string | null>(null);

  if (accounts.length === 0) {
    // Ни одного счёта: панель управления раскрыта сразу — иначе счёт негде завести.
    return (
      <div className="flex flex-col gap-4">
        {accountsManager}
        <Card>
          <EmptyState
            icon={Wallet}
            title={t.cash.report.noAccounts}
            hint={t.cash.report.noAccountsHint}
          />
        </Card>
      </div>
    );
  }

  const viewById = new Map(views.map((v) => [v.accountId, v]));

  // Данные подтверждения переноса даты остатка: цифры берём по ВСЕМУ счёту
  // (cutOff.allCount / allNet, 0020), а не по видимому периоду — настройка
  // меняется навсегда и для всей истории.
  const shiftView = shiftTarget ? viewById.get(shiftTarget) : undefined;
  const shiftAccount = shiftTarget ? accounts.find((a) => a.id === shiftTarget) : undefined;
  const shiftBalanceNow = shiftTarget
    ? (balances[shiftTarget] ?? shiftAccount?.opening_balance ?? 0)
    : 0;

  const confirmShift = () => {
    const accountId = shiftTarget;
    const earliest = shiftView?.cutOff.earliest;
    setShiftTarget(null);
    if (!accountId || !earliest) return;
    startShift(async () => {
      const res = await shiftAccountOpeningDateAction(accountId, earliest);
      if (res.ok) toast.success(res.message ?? t.cash.actions.openingDateMoved);
      else toast.error(res.message ?? t.errors.db.generic);
    });
  };

  // Счёт для новой операции: активная вкладка, а на сводных вкладках — первый
  // активный счёт (в форме его всё равно можно сменить).
  const activeAccounts = accounts.filter((a) => a.is_active);
  const entryAccountId = activeAccounts.some((a) => a.id === tab)
    ? tab
    : activeAccounts[0]?.id;

  // Разделы рейки. Суммы показываем ТОЛЬКО у счетов и свода: там источник один
  // (движение по счетам). У «Доходов» деньги считаются по оплатам в делах —
  // приписать им оборот кассы значило бы соврать (см. «два источника денег»).
  const totalOfBalances = accounts.reduce(
    (s, a) => s + (balances[a.id] ?? a.opening_balance),
    0,
  );
  const groups: RailGroup[] = [
    {
      id: 'accounts',
      title: t.cash.report.rail.groupAccounts,
      items: [
        ...accounts.map((a) => ({
          id: a.id,
          label: a.name,
          meta: money(balances[a.id] ?? a.opening_balance),
          note: a.is_active ? undefined : t.cash.accounts.inactiveBadge,
        })),
        { id: TOTAL_TAB, label: t.cash.report.tabTotal, meta: money(totalOfBalances) },
        // Панель управления счетами — раздел, а не кнопка в шапке.
        ...(accountsManager
          ? [
              {
                id: ACCOUNTS_TAB,
                label: t.cash.report.rail.manageAccounts,
                dataTour: 'cash-accounts-btn',
              },
            ]
          : []),
      ],
    },
    {
      id: 'money',
      title: t.cash.report.rail.groupMoney,
      items: [
        ...(incomeDoc ? [{ id: INCOME_TAB, label: t.cash.reports.tabIncome }] : []),
        ...(companyExpenses
          ? [
              {
                id: EXPENSES_TAB,
                label: t.cash.report.tabExpenses,
                dataTour: 'cash-expenses-tab',
              },
            ]
          : []),
        ...(profitRows ? [{ id: PROFIT_TAB, label: t.cash.report.tabProfit }] : []),
      ],
    },
    {
      id: 'reports',
      title: t.cash.report.rail.groupReports,
      items: [
        ...(turnoverDoc ? [{ id: TURNOVER_TAB, label: t.cash.reports.tabTurnover }] : []),
        ...(flowDoc ? [{ id: FLOW_TAB, label: t.cash.reports.tabFlow }] : []),
        ...(summaryDoc ? [{ id: SUMMARY_TAB, label: t.cash.reports.tabSummary }] : []),
        ...(registryDoc ? [{ id: REGISTRY_TAB, label: t.cash.reports.tabRegistry }] : []),
      ],
    },
    // Группа без прав на её данные не показывается вовсе.
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-2.5 text-[12.5px] text-warning">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
          {t.cash.report.truncatedWarning}
        </div>
      )}

      {/* Master–detail: рейка разделов слева, содержимое раздела справа. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <CashRail
          groups={groups}
          active={tab}
          onSelect={selectTab}
          ariaLabel={t.cash.report.tabsAria}
          mobileLabel={t.cash.report.rail.sectionLabel}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Действия раздела. Две кнопки вместо одной (2026-07-26): расход
              вносится ТОЛЬКО формой со статьёй, иначе отчёт «куда ушло»
              дырявый. Приход руками нужен редко (проценты банка) — оплаты
              клиентов приходят сами. */}
          {canManage && (expenseCategories.length > 0 || entryAccountId) && (
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {expenseCategories.length > 0 && (
                <span data-tour="cash-add-expense">
                  <AddExpenseDialog
                    categories={expenseCategories}
                    accounts={accounts}
                    canAddCategory={canAddCategory}
                    variant="pill"
                  />
                </span>
              )}
              {entryAccountId && (
                <CashEntryDialog accounts={accounts} accountId={entryAccountId} />
              )}
            </div>
          )}

          {tab === ACCOUNTS_TAB && accountsManager ? (
            accountsManager
          ) : tab === EXPENSES_TAB &&
            companyExpenses &&
            categorySpend &&
            categorySpendTotals ? (
            <CashExpensesPanel
              expenses={companyExpenses}
              categories={expenseCategories}
              spend={categorySpend}
              totals={categorySpendTotals}
              canManage={canManage}
              accounts={accounts}
              canAddCategory={canAddCategory}
              manualOutflow={manualOutflow}
              period={period}
            />
          ) : tab === PROFIT_TAB && profitRows && profitTotals ? (
            <CashProfitPanel rows={profitRows} totals={profitTotals} period={period} />
          ) : tab === TURNOVER_TAB && turnoverDoc && period ? (
            <CashReportPanel
              doc={turnoverDoc}
              kind="turnover"
              period={period}
              hint={t.cash.reports.turnoverHint}
            />
          ) : tab === FLOW_TAB && flowDoc && period ? (
            <CashReportPanel
              doc={flowDoc}
              kind="flow"
              period={period}
              hint={t.cash.reports.flowHint}
              chart
            />
          ) : tab === INCOME_TAB && incomeDoc && period ? (
            <CashReportPanel
              doc={incomeDoc}
              kind="income"
              period={period}
              hint={t.cash.reports.incomeHint}
              dim={incomeDim}
            />
          ) : tab === SUMMARY_TAB && summaryDoc && period ? (
            <CashReportPanel
              doc={summaryDoc}
              kind="summary"
              period={period}
              hint={t.cash.reports.summaryHint}
            />
          ) : tab === REGISTRY_TAB && registryDoc && period ? (
            <CashReportPanel
              doc={registryDoc}
              kind="registry"
              period={period}
              hint={t.cash.reports.registryHint}
            />
          ) : viewById.has(tab) ? (
            <AccountPanel
              view={viewById.get(tab)!}
              journal={journals[tab] ?? []}
              canManage={canManage}
              canEditPayments={canEditPayments}
              canManageCaseExpenses={canManageCaseExpenses}
              accounts={accounts}
              categories={allCategories.length > 0 ? allCategories : expenseCategories}
              onShiftOpening={canManage ? () => setShiftTarget(tab) : undefined}
            />
          ) : (
            // Сюда попадаем, если выбранный раздел недоступен (нет прав на его
            // данные) — показываем свод вместо падения на undefined.
            <TotalTable accounts={accounts} rows={totalRows} />
          )}
        </div>
      </div>

      {/* Подтверждение переноса даты начального остатка. Показываем ЦЕНУ
          действия числами: сколько операций начнёт считаться, на какую сумму и
          каким станет остаток. Владелец единственный, кто знает, входят ли эти
          деньги в начальный остаток, — значит решение должно приниматься на
          цифрах, а не на слове «перенести». */}
      {shiftView && shiftAccount && shiftView.cutOff.earliest && (
        <ConfirmDialog
          open
          title={t.cash.report.shiftConfirmTitle}
          description={fmt(t.cash.report.shiftConfirmBody, {
            account: shiftAccount.name,
            from: shiftView.openingDate,
            to: shiftView.cutOff.earliest,
            count: String(shiftView.cutOff.allCount),
            amount: signedMoney(shiftView.cutOff.allNet) + ' ₴',
            before: money(shiftBalanceNow),
            after: money(shiftBalanceNow + shiftView.cutOff.allNet),
          })}
          confirmLabel={t.cash.report.shiftConfirmAction}
          tone="danger"
          onConfirm={confirmShift}
          onClose={() => setShiftTarget(null)}
        >
          <p className="rounded-control border border-warning/40 bg-warning-bg px-3 py-2 text-[12.5px] leading-snug text-text">
            {t.cash.report.shiftConfirmWarning}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function AccountPanel({
  view,
  journal,
  canManage,
  canEditPayments,
  canManageCaseExpenses,
  accounts,
  categories,
  onShiftOpening,
}: {
  view: CashAccountView;
  journal: CashEntryWithCase[];
  canManage: boolean;
  canEditPayments: boolean;
  canManageCaseExpenses: boolean;
  accounts: CashAccount[];
  categories: ExpenseCategoryOption[];
  /** Перенести дату начального остатка счёта на дату самой ранней отсечённой операции. */
  onShiftOpening?: () => void;
}) {
  const { t, fmt } = useI18n();

  // Операции периода, отсечённые датой начального остатка: в разворот по дням
  // они не входят (сальдо у них нет), поэтому на мобильных им нужен отдельный
  // список — см. блок ниже.
  const cutOffEntries = journal.filter(
    (e) => !e.include_before_opening && e.entry_date < view.openingDate,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Строка «Текущий остаток» убрана 2026-07-25 — остаток теперь во вкладке
          счёта и в полосе баланса. Осталось только предупреждение. */}
      {view.monthBeforeOpening ? (
        // Весь месяц раньше даты открытия счёта: операции в журнале есть, но в
        // сальдо не входят — иначе они посчитались бы дважды (их влияние уже
        // сидит в начальном остатке). Раньше это выглядело просто как нули.
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-[12.5px] leading-snug text-text">
          <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
          <span>
            {fmt(t.cash.report.monthBeforeOpening, { date: view.openingDate })}
          </span>
        </div>
      ) : (
        view.cutOff.count > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-[12.5px] leading-snug text-text">
            <span className="flex items-start gap-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
              <span>
                {fmt(t.cash.report.cutOffWarning, {
                  count: String(view.cutOff.count),
                  amount: money(Math.abs(view.cutOff.net)),
                  date: view.openingDate,
                })}
              </span>
            </span>
            {/* Раньше плашка только объясняла проблему. Теперь чинит её —
                но НЕ в один клик: перенос даты остатка меняет отчётные суммы
                за всю историю счёта, поэтому сначала подтверждение с цифрами
                (ревью 0019: без него один клик мог раздуть остаток на всю
                историю оплат, а подпись обещала «остаток не изменится»). */}
            {onShiftOpening && view.cutOff.earliest && (
              <span className="flex flex-wrap items-center gap-2 pl-6">
                <Button size="sm" variant="secondary" onClick={onShiftOpening}>
                  <CalendarClock size={14} strokeWidth={1.75} />
                  {fmt(t.cash.report.cutOffFixAction, { date: view.cutOff.earliest })}
                </Button>
                <span className="text-[11.5px] text-text-muted">
                  {t.cash.report.cutOffFixHint}
                </span>
              </span>
            )}
          </div>
        )
      )}

      {/* Разворот по дням */}
      {view.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ArrowDownUp}
            title={t.cash.report.emptyMonth}
            hint={t.cash.report.emptyMonthHint}
          />
        </Card>
      ) : (
        <>
        {/* Мобильное представление (6.4): карточка дня с тап-разворотом операций. */}
        <div className="flex flex-col gap-2 md:hidden">
          {/* Отсечённые операции не попадают в разворот по дням (у них нет
              сальдо), а мобильный экран строится именно из него — без этого
              блока с телефона до них было НЕ ДОБРАТЬСЯ: ни открыть карточку,
              ни внести в оборот. На десктопе они видны в журнале ниже. */}
          {cutOffEntries.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-warning/40 bg-surface shadow-sm">
              <p className="border-b border-border bg-warning-bg px-3.5 py-2 text-[12px] font-semibold text-text">
                {t.cash.report.cutOffListHeading}
              </p>
              <div className="flex flex-col divide-y divide-border">
                {cutOffEntries.map((e) => (
                  <JournalRow
                    key={e.id}
                    entry={e}
                    canManage={canManage}
                    canEditPayments={canEditPayments}
                    canManageCaseExpenses={canManageCaseExpenses}
                    accounts={accounts}
                    categories={categories}
                  />
                ))}
              </div>
            </div>
          )}
          {view.rows.map((r: CashDayRow) => (
            <DayCardMobile
              key={r.date}
              row={r}
              entries={journal.filter((e) => e.entry_date === r.date)}
              canManage={canManage}
              canEditPayments={canEditPayments}
              canManageCaseExpenses={canManageCaseExpenses}
              accounts={accounts}
              categories={categories}
              balances={view.entryBalances}
            />
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 tabular-nums text-[12.5px] shadow-sm">
            <span className="text-text-muted">
              {t.cash.report.monthInflow}{' '}
              <span className="font-mono font-bold text-success-text">{signedMoney(view.totals.inflow, 'in')} ₴</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthOutflow}{' '}
              <span className="font-mono font-bold text-error">{signedMoney(view.totals.outflow, 'out')} ₴</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthNet}{' '}
              <span className={cn('font-mono font-bold', view.totals.net >= 0 ? 'text-success-text' : 'text-error')}>
                {signedMoney(view.totals.net)} ₴
              </span>
            </span>
          </div>
        </div>

        <div className="hidden overflow-auto rounded-card border border-border bg-surface shadow-sm md:block">
          <Table>
            <TableHeader className="bg-surface-sunken/50">
              <TableRow className="hover:bg-surface">
                <TableHead>{t.cash.report.colDate}</TableHead>
                <TableHead className="text-right">{t.cash.report.colOpening}</TableHead>
                <TableHead className="text-right">{t.cash.report.colInflow}</TableHead>
                <TableHead className="text-right">{t.cash.report.colOutflow}</TableHead>
                <TableHead className="text-right">{t.cash.report.colClosing}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((r: CashDayRow) => (
                <TableRow key={r.date} className="hover:bg-primary-softer">
                  <TableCell className="whitespace-nowrap font-mono text-[12px] tabular-nums text-text">
                    {r.date}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-text-muted">
                    {money(r.opening)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-success-text">
                    {r.inflow > 0 ? `+${money(r.inflow)}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-error">
                    {r.outflow > 0 ? `−${money(r.outflow)}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] font-bold text-text">
                    {money(r.closing)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-t border-border bg-surface-sunken/50 px-4 py-3 tabular-nums text-[13px]">
            <span className="text-text-muted">
              {t.cash.report.monthInflow}{' '}
              <span className="font-mono font-bold text-success-text">{signedMoney(view.totals.inflow, 'in')} ₴</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthOutflow}{' '}
              <span className="font-mono font-bold text-error">{signedMoney(view.totals.outflow, 'out')} ₴</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthNet}{' '}
              <span className={cn('font-mono font-bold', view.totals.net >= 0 ? 'text-success-text' : 'text-error')}>
                {signedMoney(view.totals.net)} ₴
              </span>
            </span>
          </div>
        </div>
        </>
      )}

      {/* Журнал операций месяца — карточка-секция со счётчиком. На мобильных
          скрыт — операции доступны из разворота дня (DayCardMobile). */}
      <div className="hidden rounded-card border border-border bg-surface shadow-sm md:block">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold text-text">{t.cash.report.journalHeading}</h3>
          <span className="inline-flex items-center rounded-chip bg-surface-sunken px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-text-muted">
            {journal.length}
          </span>
        </div>
        {journal.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-text-muted">{t.cash.report.journalEmpty}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {journal.map((e) => (
              <JournalRow
                key={e.id}
                entry={e}
                canManage={canManage}
                canEditPayments={canEditPayments}
                canManageCaseExpenses={canManageCaseExpenses}
                accounts={accounts}
                categories={categories}
                balance={view.entryBalances[e.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Мобильная карточка дня (6.4): «дата · приход · расход · сальдо», тап
// разворачивает операции этого дня (details/summary, без JS-состояния).
function DayCardMobile({
  row,
  entries,
  canManage,
  canEditPayments,
  canManageCaseExpenses,
  accounts,
  categories,
  balances,
}: {
  row: CashDayRow;
  entries: CashEntryWithCase[];
  canManage: boolean;
  canEditPayments: boolean;
  canManageCaseExpenses: boolean;
  accounts: CashAccount[];
  categories: ExpenseCategoryOption[];
  /** Накопительный остаток по операциям (entryId → остаток после неё). */
  balances: Record<string, number>;
}) {
  const { t } = useI18n();

  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <summary className="cursor-pointer list-none p-3.5 transition-colors active:bg-surface-muted">
        <span className="flex items-center justify-between gap-3">
          <span className="font-mono text-[13px] font-bold tabular-nums text-text">
            {row.date}
          </span>
          <span className="text-[12px] tabular-nums text-text-muted">
            {t.cash.report.colClosing}:{' '}
            <span className="font-mono font-bold text-text">{money(row.closing)}</span>
          </span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[12.5px]">
          <span className="text-success-text">
            {row.inflow > 0 ? `+${money(row.inflow)}` : '—'}
          </span>
          <span className="text-error">
            {row.outflow > 0 ? `−${money(row.outflow)}` : '—'}
          </span>
          <span className="ml-auto text-text-subtle">
            {t.cash.report.colOpening}: {money(row.opening)}
          </span>
        </span>
      </summary>
      {entries.length > 0 && (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {entries.map((e) => (
            <JournalRow
              key={e.id}
              entry={e}
              canManage={canManage}
              canEditPayments={canEditPayments}
              canManageCaseExpenses={canManageCaseExpenses}
              accounts={accounts}
              categories={categories}
              balance={balances[e.id]}
            />
          ))}
        </div>
      )}
    </details>
  );
}

// Интерактивные потомки строки: клик по ним не открывает карточку операции
// (зеркало ui/clickable-row.tsx).
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

function JournalRow({
  entry,
  canManage,
  canEditPayments,
  canManageCaseExpenses,
  accounts,
  categories,
  balance,
}: {
  entry: CashEntryWithCase;
  canManage: boolean;
  /** Право edit_payments — правка платежа-источника из карточки операции. */
  canEditPayments: boolean;
  /** Право manage_case_expenses — правка расхода по делу. */
  canManageCaseExpenses: boolean;
  accounts: CashAccount[];
  /** Активные статьи расходов (для правки расхода-источника). */
  categories: ExpenseCategoryOption[];
  /**
   * Остаток счёта ПОСЛЕ этой операции. undefined — операция датирована раньше
   * начального остатка счёта и в сальдо не входит (показываем прочерк, иначе
   * колонка врала бы о состоянии счёта).
   */
  balance?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Авто-строки (приход от платежа ИЛИ Розхід от расхода) правятся только через
  // свою сущность — корзинку в журнале не показываем (QA 27.07: expense_id).
  const isAuto = entry.payment_id !== null || entry.expense_id !== null;
  const isIn = entry.direction === 'in';
  const sign = isIn ? '+' : '−';
  const cls = isIn ? 'text-success-text' : 'text-error';

  // Клик по строке открывает карточку; клавиатурный путь — на кнопке-описании
  // (вкладывать её в кнопку-строку нельзя: внутри есть ссылка на дело).
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    setOpen(true);
  };

  return (
    <div
      onClick={handleRowClick}
      className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-primary-softer"
    >
      <span className="font-mono text-[12px] tabular-nums text-text-subtle">{entry.entry_date}</span>
      {/* Чип направления (AA: текст на подложке — *-text, тон несёт стрелка) */}
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold',
          isIn ? 'bg-success-bg text-success-text' : 'bg-error-bg text-error-text',
        )}
      >
        {isIn ? (
          <ArrowDownLeft size={11} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <ArrowUpRight size={11} strokeWidth={2.5} aria-hidden="true" />
        )}
        {isIn ? t.cash.report.colInflow : t.cash.report.colOutflow}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t.cash.details.openHint}
        className="min-w-0 flex-1 truncate rounded text-left text-[13px] text-text hover:text-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {entry.description}
      </button>
      {entry.case && (
        <Link
          href={`/cases/${entry.case.id}`}
          className="inline-flex items-center gap-1 font-mono text-[12px] text-primary hover:underline"
        >
          <Link2 size={12} strokeWidth={1.75} />
          {entry.case.number_title}
        </Link>
      )}
      {isAuto && (
        <Badge tone="info" quiet title={t.cash.report.autoHint}>
          {t.cash.report.autoBadge}
        </Badge>
      )}
      <span className={cn('font-mono tabular-nums text-[13px] font-bold', cls)}>
        {sign}
        {money(entry.amount)}
      </span>
      {/* Остаток счёта после операции — чтобы не складывать в уме. Стрелка
          отделяет его от суммы самой операции: «было движение → стало столько». */}
      <span
        className="hidden w-[132px] shrink-0 text-right font-mono text-[12px] tabular-nums text-text-subtle sm:inline-block"
        title={
          balance === undefined
            ? t.cash.report.balanceNotCounted
            : t.cash.report.balanceAfter
        }
      >
        {balance === undefined ? '—' : `→ ${money(balance)}`}
      </span>
      {/* Удалять можно только ручные операции (и только менеджеру кассы);
          авто-приход правится через сам платёж. */}
      {canManage && !isAuto ? (
        <form action={deleteCashEntryAction}>
          <input type="hidden" name="id" value={entry.id} />
          <button
            type="submit"
            aria-label={t.cash.entry.delete}
            title={t.cash.entry.delete}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-text-subtle transition-colors hover:bg-error-bg hover:text-error"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </form>
      ) : (
        <span className="inline-block h-7 w-7" aria-hidden />
      )}

      {/* Монтируем только открытую карточку: журнал бывает на сотни строк, и
          держать столько же незакрытых диалогов (каждый со своим состоянием
          загрузки) незачем. */}
      {open && (
        <CashEntryDetailsDialog
          entry={entry}
          open
          onClose={() => setOpen(false)}
          canManage={canManage}
          canEditPayments={canEditPayments}
          canManageCaseExpenses={canManageCaseExpenses}
          accounts={accounts}
          categories={categories}
          balance={balance}
        />
      )}
    </div>
  );
}

function TotalTable({
  accounts,
  rows,
}: {
  accounts: CashAccount[];
  rows: CashTotalRow[];
}) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ArrowDownUp}
          title={t.cash.report.emptyTotal}
          hint={t.cash.report.emptyTotalHint}
        />
      </Card>
    );
  }

  return (
    <div className="overflow-auto rounded-card border border-border bg-surface shadow-sm">
      <Table>
        <TableHeader className="bg-surface-sunken/50">
          <TableRow className="hover:bg-surface">
            <TableHead>{t.cash.report.colDate}</TableHead>
            {accounts.map((a) => (
              <TableHead key={a.id} className="text-right">
                {a.name}
              </TableHead>
            ))}
            <TableHead className="text-right">{t.cash.report.colTotalAmount}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.date} className="hover:bg-primary-softer">
              <TableCell className="whitespace-nowrap font-mono text-[12px] tabular-nums text-text">
                {r.date}
              </TableCell>
              {accounts.map((a) => (
                <TableCell
                  key={a.id}
                  className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] text-text-muted"
                >
                  {money(r.perAccount[a.id] ?? 0)}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-[13px] font-bold text-text">
                {money(r.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
