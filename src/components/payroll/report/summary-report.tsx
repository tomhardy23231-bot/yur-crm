'use client';

import type { SummaryReport } from '@/lib/payroll/report';
import { DOC } from '@/components/payroll/report/report-document';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';

export function SummaryReportBody({ report }: { report: SummaryReport }) {
  const { t, fmt } = useI18n();
  const { rows, totals } = report;

  return (
    <>
      {/* Ключевые показатели */}
      <section className="break-inside-avoid">
        <div
          className="grid grid-cols-2 sm:grid-cols-5"
          style={{ border: `1px solid ${DOC.hair}`, borderTop: `2px solid ${DOC.accent}` }}
        >
          <Kpi label={t.payrollPrint.summary.kpiEmployees} value={String(rows.length)} />
          <Kpi label={t.payrollPrint.summary.kpiEarnedMonth} value={`${formatMoney(totals.earned)} ₴`} />
          <Kpi label={t.payrollPrint.summary.kpiBonusMonth} value={`${totals.bonus > 0 ? '+' : ''}${formatMoney(totals.bonus)} ₴`} />
          <Kpi label={t.payrollPrint.summary.kpiPayoutMonth} value={`${formatMoney(totals.payout)} ₴`} valueColor={DOC.green} />
          <Kpi label={t.payrollPrint.summary.kpiBalance} value={`${formatMoney(totals.balance)} ₴`} valueColor={DOC.amber} />
        </div>
      </section>

      <Section title={t.payrollPrint.summary.tableTitle} count={rows.length}>
        {rows.length === 0 ? (
          <p className="py-3 text-[12px]" style={{ color: DOC.muted }}>
            {t.payrollPrint.summary.empty}
          </p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <Tr head>
                <Th>{t.payrollPrint.summary.colEmployee}</Th>
                <Th align="right">{t.payrollPrint.summary.colEarned}</Th>
                <Th align="right">{t.payrollPrint.summary.colBonus}</Th>
                <Th align="right">{t.payrollPrint.summary.colPayout}</Th>
                <Th align="right">{t.payrollPrint.summary.colBalance}</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.user_id}>
                  <Td>
                    <span className="font-medium" style={{ color: DOC.ink }}>
                      {r.full_name}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {formatMoney(r.earned)} ₴
                  </Td>
                  <Td align="right" mono color={r.bonus > 0 ? DOC.body : DOC.subtle}>
                    {r.bonus > 0 ? `+${formatMoney(r.bonus)} ₴` : t.common.dash}
                  </Td>
                  <Td align="right" mono color={DOC.green}>
                    {formatMoney(r.payout)} ₴
                  </Td>
                  <Td align="right" mono color={DOC.amber}>
                    <span className="font-semibold">{formatMoney(r.balance)} ₴</span>
                  </Td>
                </Tr>
              ))}
              <Tr foot>
                <Td>
                  <span className="font-bold" style={{ color: DOC.ink }}>
                    {fmt(t.payrollPrint.summary.totalRow, { n: rows.length })}
                  </span>
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.ink }}>
                    {formatMoney(totals.earned)} ₴
                  </span>
                </Td>
                <Td align="right" mono color={DOC.muted}>
                  {totals.bonus > 0 ? `+${formatMoney(totals.bonus)} ₴` : t.common.dash}
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.green }}>
                    {formatMoney(totals.payout)} ₴
                  </span>
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.amber }}>
                    {formatMoney(totals.balance)} ₴
                  </span>
                </Td>
              </Tr>
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

function Kpi({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4" style={{ borderLeft: `1px solid ${DOC.hair}` }}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: DOC.subtle }}>
        {label}
      </span>
      <span
        className="whitespace-nowrap text-[18px] font-bold leading-none tabular-nums"
        style={{ color: valueColor ?? DOC.ink }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div
        className="flex items-baseline justify-between gap-2 pb-1.5"
        style={{ borderBottom: `1px solid ${DOC.hairStrong}` }}
      >
        <h2 className="text-[12.5px] font-bold uppercase tracking-[0.07em]" style={{ color: DOC.ink }}>
          {title}
        </h2>
        {count != null && (
          <span className="text-[11px] tabular-nums" style={{ color: DOC.subtle }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Tr({
  children,
  head,
  foot,
}: {
  children: React.ReactNode;
  head?: boolean;
  foot?: boolean;
}) {
  const style = head
    ? { borderBottom: `1.5px solid ${DOC.hairStrong}` }
    : foot
      ? { borderTop: `1.5px solid ${DOC.hairStrong}` }
      : { borderBottom: `1px solid ${DOC.hair}` };
  return (
    <tr className="break-inside-avoid" style={style}>
      {children}
    </tr>
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
      className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em]"
      style={{ color: DOC.muted, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono,
  color,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`px-2.5 py-2.5 align-top ${mono ? 'whitespace-nowrap tabular-nums' : ''}`}
      style={{ textAlign: align, color: color ?? DOC.body }}
    >
      {children}
    </td>
  );
}
