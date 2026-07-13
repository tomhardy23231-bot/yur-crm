'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, AlertTriangle, ArrowDownUp, Link2, Wallet } from 'lucide-react';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccount, CashEntryWithCase } from '@/lib/types/db';
import type { CashDayRow, CashMonthTotals, CashTotalRow } from '@/lib/cash/saldo';
import { deleteCashEntryAction } from '@/lib/cash/actions';
import { CashEntryForm } from './cash-entry-form';

export type CashAccountView = {
  accountId: string;
  rows: CashDayRow[];
  totals: CashMonthTotals;
  closingNow: number;
  hasBeforeOpening: boolean;
};

const TOTAL_TAB = '__total__';

function money(n: number): string {
  return `${formatMoney(n)} ₴`;
}

export function CashReport({
  accounts,
  views,
  totalRows,
  journals,
  truncated = false,
}: {
  accounts: CashAccount[];
  views: CashAccountView[];
  totalRows: CashTotalRow[];
  journals: Record<string, CashEntryWithCase[]>;
  truncated?: boolean;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<string>(accounts[0]?.id ?? TOTAL_TAB);

  if (accounts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Wallet}
          title={t.cash.report.noAccounts}
          hint={t.cash.report.noAccountsHint}
        />
      </Card>
    );
  }

  const viewById = new Map(views.map((v) => [v.accountId, v]));

  return (
    <div className="flex flex-col gap-4">
      {truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-2.5 text-[12.5px] text-warning">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
          {t.cash.report.truncatedWarning}
        </div>
      )}

      {/* Вкладки: по счёту + сводная. */}
      <div
        role="tablist"
        aria-label={t.cash.report.tabsAria}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {accounts.map((a) => (
          <TabButton key={a.id} active={tab === a.id} onClick={() => setTab(a.id)}>
            {a.name}
            {!a.is_active && (
              <span className="ml-1 text-[10px] text-text-subtle">
                ({t.cash.accounts.inactiveBadge})
              </span>
            )}
          </TabButton>
        ))}
        <TabButton active={tab === TOTAL_TAB} onClick={() => setTab(TOTAL_TAB)} strong>
          {t.cash.report.tabTotal}
        </TabButton>
      </div>

      {tab === TOTAL_TAB ? (
        <TotalTable accounts={accounts} rows={totalRows} />
      ) : (
        (() => {
          const acc = accounts.find((a) => a.id === tab)!;
          const view = viewById.get(tab)!;
          return (
            <AccountPanel
              account={acc}
              accounts={accounts}
              view={view}
              journal={journals[tab] ?? []}
            />
          );
        })()
      )}
    </div>
  );
}

function TabButton({
  active,
  strong,
  onClick,
  children,
}: {
  active: boolean;
  strong?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'whitespace-nowrap border-b-2 px-4 py-2 text-[13px] transition-colors',
        strong ? 'font-semibold' : 'font-medium',
        active
          ? 'border-primary text-text'
          : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function AccountPanel({
  account,
  accounts,
  view,
  journal,
}: {
  account: CashAccount;
  accounts: CashAccount[];
  view: CashAccountView;
  journal: CashEntryWithCase[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] text-text-muted">
          {t.cash.accounts.closingNow}:{' '}
          <span className="tabular-nums text-[15px] font-bold text-text">
            {money(view.closingNow)}
          </span>
        </span>
        {view.hasBeforeOpening && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-warning">
            <AlertTriangle size={13} strokeWidth={1.75} />
            {t.cash.report.beforeOpeningWarning}
          </span>
        )}
      </div>

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
          {view.rows.map((r: CashDayRow) => (
            <DayCardMobile
              key={r.date}
              row={r}
              entries={journal.filter((e) => e.entry_date === r.date)}
            />
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 tabular-nums text-[12.5px] shadow-sm">
            <span className="text-text-muted">
              {t.cash.report.monthInflow}{' '}
              <span className="font-bold text-success-text">+{money(view.totals.inflow)}</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthOutflow}{' '}
              <span className="font-bold text-error">−{money(view.totals.outflow)}</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthNet}{' '}
              <span className={cn('font-bold', view.totals.net >= 0 ? 'text-success-text' : 'text-error')}>
                {view.totals.net >= 0 ? '+' : '−'}
                {money(Math.abs(view.totals.net))}
              </span>
            </span>
          </div>
        </div>

        <div className="hidden overflow-auto rounded-lg border border-border bg-surface shadow-sm md:block">
          <Table>
            <TableHeader>
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
                <TableRow key={r.date} className="hover:bg-surface-muted/40">
                  <TableCell className="whitespace-nowrap text-[13px] text-text">{r.date}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-text-muted">
                    {money(r.opening)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-success-text">
                    {r.inflow > 0 ? `+${money(r.inflow)}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] text-error">
                    {r.outflow > 0 ? `−${money(r.outflow)}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] font-bold text-text">
                    {money(r.closing)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-t border-border bg-surface-muted/50 px-4 py-3 tabular-nums text-[13px]">
            <span className="text-text-muted">
              {t.cash.report.monthInflow}{' '}
              <span className="font-bold text-success-text">+{money(view.totals.inflow)}</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthOutflow}{' '}
              <span className="font-bold text-error">−{money(view.totals.outflow)}</span>
            </span>
            <span className="text-text-muted">
              {t.cash.report.monthNet}{' '}
              <span className={cn('font-bold', view.totals.net >= 0 ? 'text-success-text' : 'text-error')}>
                {view.totals.net >= 0 ? '+' : '−'}
                {money(Math.abs(view.totals.net))}
              </span>
            </span>
          </div>
        </div>
        </>
      )}

      {/* Журнал операций месяца. На мобильных скрыт — операции доступны из
          разворота дня (DayCardMobile), дублировать список незачем. */}
      <div className="hidden flex-col gap-2 md:flex">
        <h3 className="text-[13px] font-semibold text-text">{t.cash.report.journalHeading}</h3>
        {journal.length === 0 ? (
          <p className="text-[13px] text-text-muted">{t.cash.report.journalEmpty}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {journal.map((e) => (
              <JournalRow key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>

      {/* Добавление ручной операции (счёт активной вкладки предвыбран). */}
      {account.is_active && (
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-text">{t.cash.entry.heading}</h3>
          <CashEntryForm accounts={accounts} accountId={account.id} />
        </Card>
      )}
    </div>
  );
}

// Мобильная карточка дня (6.4): «дата · приход · расход · сальдо», тап
// разворачивает операции этого дня (details/summary, без JS-состояния).
function DayCardMobile({
  row,
  entries,
}: {
  row: CashDayRow;
  entries: CashEntryWithCase[];
}) {
  const { t } = useI18n();

  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <summary className="cursor-pointer list-none p-3.5 transition-colors active:bg-surface-muted">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-bold tabular-nums text-text">
            {row.date}
          </span>
          <span className="text-[12px] tabular-nums text-text-muted">
            {t.cash.report.colClosing}:{' '}
            <span className="font-bold text-text">{money(row.closing)}</span>
          </span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums text-[12.5px]">
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
            <JournalRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </details>
  );
}

function JournalRow({ entry }: { entry: CashEntryWithCase }) {
  const { t } = useI18n();
  const isAuto = entry.payment_id !== null;
  const sign = entry.direction === 'in' ? '+' : '−';
  const cls = entry.direction === 'in' ? 'text-success-text' : 'text-error';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span className="tabular-nums text-[12px] text-text-subtle">{entry.entry_date}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{entry.description}</span>
      {entry.case && (
        <Link
          href={`/cases/${entry.case.id}`}
          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
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
      <span className={cn('tabular-nums text-[13px] font-semibold', cls)}>
        {sign}
        {money(entry.amount)}
      </span>
      {/* Удалять можно только ручные операции; авто-приход правится через сам платёж. */}
      {!isAuto ? (
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
    <div className="overflow-auto rounded-lg border border-border bg-surface shadow-sm">
      <Table>
        <TableHeader>
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
            <TableRow key={r.date} className="hover:bg-surface-muted/40">
              <TableCell className="whitespace-nowrap text-[13px] text-text">{r.date}</TableCell>
              {accounts.map((a) => (
                <TableCell
                  key={a.id}
                  className="whitespace-nowrap text-right tabular-nums text-[13px] text-text-muted"
                >
                  {money(r.perAccount[a.id] ?? 0)}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap text-right tabular-nums text-[13px] font-bold text-text">
                {money(r.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
