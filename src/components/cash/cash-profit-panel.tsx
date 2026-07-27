'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { cn, formatMoney, signedMoney } from '@/lib/utils';
import type { ProfitRow, ProfitTotals } from '@/lib/expenses/report';

// Вкладка «По делам» в отчёте кассы: дохід / витрати / маржа по каждому делу за
// выбранный месяц. Живёт внутри «Кассы» (решение владельца 2026-07-24: всё про
// деньги — в одном разделе), а не отдельным пунктом меню.
//
// Отличие от остальных вкладок: те режут деньги ПО СЧЕТАМ и дням, эта — ПО ДЕЛАМ.

const TONE = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  error: 'text-error',
} as const;

type Tone = keyof typeof TONE;

export function CashProfitPanel({
  rows,
  totals,
}: {
  rows: ProfitRow[];
  totals: ProfitTotals;
}) {
  const { t, plural } = useI18n();
  const r = t.expenses.report;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={Scale} title={r.empty} hint={r.hint} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={r.totalIncome}
          value={formatMoney(totals.income)}
          tone="success"
          icon={<ArrowDownLeft size={13} strokeWidth={2.5} />}
        />
        <StatTile
          label={r.totalExpense}
          value={signedMoney(totals.expense, 'out')}
          tone="warning"
          icon={<ArrowUpRight size={13} strokeWidth={2.5} />}
        />
        <StatTile
          label={r.totalMargin}
          value={`${totals.margin < 0 ? '−' : ''}${formatMoney(Math.abs(totals.margin))}`}
          tone={totals.margin < 0 ? 'error' : 'success'}
          icon={<Scale size={13} strokeWidth={2.5} />}
        />
      </section>

      <p className="text-[12.5px] text-text-subtle">{r.hint}</p>
      <p className="text-[12.5px] text-text-subtle">{plural(r.casesCount, rows.length)}</p>

      {/* Desktop — таблица. */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-sunken/60 text-left">
              <Th>{r.colCase}</Th>
              <Th>{r.colClient}</Th>
              <Th align="right">{r.colIncome}</Th>
              <Th align="right">{r.colExpense}</Th>
              <Th align="right">{r.colMargin}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.case_id} className="hover:bg-surface-muted/60">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/cases/${row.case_id}`}
                    className="font-medium text-text transition-colors hover:text-primary-pressed"
                  >
                    {row.number_title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-text-muted">{row.client_name ?? '—'}</td>
                <Money value={row.income} tone="success" />
                <Money value={row.expense} tone="warning" negative={row.expense > 0} />
                <Money
                  value={row.margin}
                  tone={row.margin < 0 ? 'error' : 'success'}
                  signed
                />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-sunken/60 font-semibold">
              <td className="px-4 py-3" colSpan={2}>
                {r.totalRow}
              </td>
              <Money value={totals.income} tone="success" />
              <Money value={totals.expense} tone="warning" negative={totals.expense > 0} />
              <Money
                value={totals.margin}
                tone={totals.margin < 0 ? 'error' : 'success'}
                signed
              />
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Mobile — карточки-строки. */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <Card key={row.case_id} className="p-4">
            <Link
              href={`/cases/${row.case_id}`}
              className="text-[13.5px] font-semibold text-text"
            >
              {row.number_title}
            </Link>
            {row.client_name && (
              <p className="mt-0.5 text-[12px] text-text-muted">{row.client_name}</p>
            )}
            <div className="mt-3 flex flex-col gap-1.5">
              <MobileRow
                label={r.colIncome}
                value={`${formatMoney(row.income)} ₴`}
                tone="success"
              />
              <MobileRow
                label={r.colExpense}
                value={`${row.expense > 0 ? '−' : ''}${formatMoney(row.expense)} ₴`}
                tone="warning"
              />
              <MobileRow
                label={r.colMargin}
                value={`${row.margin < 0 ? '−' : ''}${formatMoney(Math.abs(row.margin))} ₴`}
                tone={row.margin < 0 ? 'error' : 'success'}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-flex', TONE[tone])} aria-hidden="true">
          {icon}
        </span>
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-text-subtle">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'mt-1.5 font-mono text-[24px] font-bold leading-none tabular-nums',
          TONE[tone],
        )}
      >
        {value} ₴
      </p>
    </Card>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-text-subtle',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

function Money({
  value,
  tone,
  negative,
  signed,
}: {
  value: number;
  tone: Tone;
  negative?: boolean;
  signed?: boolean;
}) {
  const prefix = signed ? (value < 0 ? '−' : '') : negative ? '−' : '';
  const shown = signed ? Math.abs(value) : value;
  return (
    <td
      className={cn(
        'px-4 py-2.5 text-right font-mono font-semibold tabular-nums',
        TONE[tone],
      )}
    >
      {prefix}
      {formatMoney(shown)} ₴
    </td>
  );
}

function MobileRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-text-muted">{label}</span>
      <span className={cn('font-mono text-[13.5px] font-bold tabular-nums', TONE[tone])}>
        {value}
      </span>
    </div>
  );
}
