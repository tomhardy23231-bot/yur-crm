'use client';

import Link from 'next/link';

import type { EmployeeReport } from '@/lib/payroll/report';
import { DOC } from '@/components/payroll/report/report-document';
import { useI18n } from '@/lib/i18n/provider';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

export function EmployeeReportBody({ report }: { report: EmployeeReport }) {
  const { t, fmt } = useI18n();
  const payMethod: Record<string, string> = t.payrollPrint.payMethod;
  const {
    earnedMonth,
    bonusMonth,
    payoutMonth,
    balance,
    casesOutstandingAll,
    bonusOutstandingAll,
    lawyerEarned,
    expertEarned,
    casesCount,
    contractSumTotal,
    clientPaidTotal,
    cases,
    clientPayments,
    bonuses,
    payouts,
  } = report;

  return (
    <>
      {/* Ключевые показатели */}
      <section className="break-inside-avoid">
        <div
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{
            border: `1px solid ${DOC.hair}`,
            borderTop: `2px solid ${DOC.accent}`,
          }}
        >
          <Kpi label={t.payrollPrint.employee.kpiEarnedMonth} value={`${MONEY.format(earnedMonth)} ₴`} />
          <Kpi label={t.payrollPrint.employee.kpiBonusMonth} value={`${bonusMonth > 0 ? '+' : ''}${MONEY.format(bonusMonth)} ₴`} />
          <Kpi label={t.payrollPrint.employee.kpiPayoutMonth} value={`${MONEY.format(payoutMonth)} ₴`} valueColor={DOC.green} />
          <Kpi
            label={t.payrollPrint.employee.kpiBalance}
            value={`${MONEY.format(balance)} ₴`}
            valueColor={DOC.amber}
            caption={fmt(t.payrollPrint.employee.kpiBalanceCaption, {
              cases: MONEY.format(casesOutstandingAll),
              bonus: MONEY.format(bonusOutstandingAll),
            })}
          />
        </div>
        {/* Доп. показатели */}
        <div
          className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-[11.5px]"
          style={{ color: DOC.muted }}
        >
          <Metric label={t.payrollPrint.employee.metricCasesMonth} value={String(casesCount)} />
          <Metric label={t.payrollPrint.employee.metricClientPaid} value={`${MONEY.format(clientPaidTotal)} ₴`} />
          <Metric label={t.payrollPrint.employee.metricContractSum} value={`${MONEY.format(contractSumTotal)} ₴`} />
          {lawyerEarned > 0 && <Metric label={t.payrollPrint.employee.metricLawyerEarned} value={`${MONEY.format(lawyerEarned)} ₴`} />}
          {expertEarned > 0 && <Metric label={t.payrollPrint.employee.metricExpertEarned} value={`${MONEY.format(expertEarned)} ₴`} />}
        </div>
      </section>

      {/* Дела и начисления */}
      <Section title={t.payrollPrint.employee.casesTitle} count={cases.length}>
        {cases.length === 0 ? (
          <Empty>{t.payrollPrint.employee.casesEmpty}</Empty>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>{t.payrollPrint.employee.colCaseClient}</Th>
                <Th>{t.payrollPrint.employee.colCategoryStage}</Th>
                <Th>{t.payrollPrint.employee.colRoleRate}</Th>
                <Th align="right">{t.payrollPrint.employee.colClientPaid}</Th>
                <Th align="right">{t.payrollPrint.employee.colEarned}</Th>
                <Th align="right">{t.payrollPrint.employee.colPaid}</Th>
                <Th align="right">{t.payrollPrint.employee.colOutstanding}</Th>
              </Tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <Tr key={`${c.case_id}-${c.role_in_case}`}>
                  <Td>
                    <Link
                      href={`/cases/${c.case_id}`}
                      className="font-medium underline-offset-2 hover:underline"
                      style={{ color: DOC.ink }}
                    >
                      {c.number_title}
                    </Link>
                    {c.client_name && (
                      <div className="text-[11px]" style={{ color: DOC.muted }}>
                        {c.client_name}
                      </div>
                    )}
                  </Td>
                  <Td color={DOC.muted}>
                    {c.category ? t.enums.caseCategory[c.category] : t.common.dash}
                    <div className="text-[11px]" style={{ color: DOC.subtle }}>
                      {t.enums.caseStage[c.stage]}
                    </div>
                  </Td>
                  <Td color={DOC.muted}>
                    {t.enums.roleInCase[c.role_in_case]}
                    <div className="text-[11px]" style={{ color: DOC.subtle }}>
                      {MONEY.format(c.percent)}%
                    </div>
                  </Td>
                  <Td align="right" mono color={DOC.muted}>
                    {MONEY.format(c.paid_total)} ₴
                  </Td>
                  <Td align="right" mono>
                    <span className="font-semibold" style={{ color: DOC.ink }}>
                      {MONEY.format(c.earned)} ₴
                    </span>
                  </Td>
                  <Td align="right" mono color={DOC.green}>
                    {MONEY.format(c.paid)} ₴
                  </Td>
                  <Td align="right" mono color={c.outstanding > 0.001 ? DOC.amber : DOC.subtle}>
                    {MONEY.format(Math.max(0, c.outstanding))} ₴
                  </Td>
                </Tr>
              ))}
              <Tr foot>
                <Td colSpan={3}>
                  <span className="font-semibold" style={{ color: DOC.ink }}>
                    {t.payrollPrint.employee.casesTotal}
                  </span>
                </Td>
                <Td align="right" mono color={DOC.muted}>
                  {MONEY.format(cases.reduce((s, c) => s + c.paid_total, 0))} ₴
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.ink }}>
                    {MONEY.format(cases.reduce((s, c) => s + c.earned, 0))} ₴
                  </span>
                </Td>
                <Td align="right" mono color={DOC.green}>
                  {MONEY.format(cases.reduce((s, c) => s + c.paid, 0))} ₴
                </Td>
                <Td align="right" mono color={DOC.amber}>
                  {MONEY.format(cases.reduce((s, c) => s + Math.max(0, c.outstanding), 0))} ₴
                </Td>
              </Tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* Поступления от клиентов за период (основание начислений) */}
      {clientPayments.length > 0 && (
        <Section title={t.payrollPrint.employee.paymentsTitle} count={clientPayments.length}>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>{t.payrollPrint.employee.colDate}</Th>
                <Th>{t.payrollPrint.employee.colCase}</Th>
                <Th>{t.payrollPrint.employee.colMethod}</Th>
                <Th align="right">{t.payrollPrint.employee.colAmount}</Th>
              </Tr>
            </thead>
            <tbody>
              {clientPayments.map((p, i) => (
                <Tr key={`${p.case_id}-${p.paid_at}-${i}`}>
                  <Td mono color={DOC.muted}>{fmtDate(p.paid_at)}</Td>
                  <Td>
                    <Link
                      href={`/cases/${p.case_id}`}
                      className="underline-offset-2 hover:underline"
                      style={{ color: DOC.ink }}
                    >
                      {p.number_title}
                    </Link>
                  </Td>
                  <Td color={DOC.muted}>{p.method ? (payMethod[p.method] ?? p.method) : t.common.dash}</Td>
                  <Td align="right" mono>
                    <span className="font-semibold" style={{ color: DOC.ink }}>
                      {MONEY.format(p.amount)} ₴
                    </span>
                  </Td>
                </Tr>
              ))}
              <Tr foot>
                <Td colSpan={3}>
                  <span className="font-semibold" style={{ color: DOC.ink }}>
                    {t.payrollPrint.employee.paymentsTotal}
                  </span>
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.ink }}>
                    {MONEY.format(clientPaidTotal)} ₴
                  </span>
                </Td>
              </Tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Выплаты сотруднику */}
      <Section title={t.payrollPrint.employee.payoutsTitle} count={payouts.length}>
        {payouts.length === 0 ? (
          <Empty>{t.payrollPrint.employee.payoutsEmpty}</Empty>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>{t.payrollPrint.employee.colDate}</Th>
                <Th>{t.payrollPrint.employee.colPurpose}</Th>
                <Th align="right">{t.payrollPrint.employee.colAmount}</Th>
              </Tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <Tr key={p.id}>
                  <Td mono color={DOC.muted}>{fmtDate(p.occurred_on)}</Td>
                  <Td>
                    {p.allocations.length === 0 && p.bonusPortion <= 0.001 && !p.comment ? (
                      <span style={{ color: DOC.muted }}>{t.common.dash}</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {p.allocations.map((a) => (
                          <span key={`${a.case_id}-${a.role_in_case}`} style={{ color: DOC.body }}>
                            {a.number_title}{' '}
                            <span className="font-mono tabular-nums" style={{ color: DOC.muted }}>
                              {MONEY.format(a.amount)} ₴
                            </span>
                          </span>
                        ))}
                        {p.bonusPortion > 0.001 && (
                          <span style={{ color: DOC.body }}>
                            {t.payrollPrint.employee.bonusLabel}{' '}
                            <span className="font-mono tabular-nums" style={{ color: DOC.muted }}>
                              {MONEY.format(p.bonusPortion)} ₴
                            </span>
                          </span>
                        )}
                        {p.comment && (
                          <span className="text-[11px]" style={{ color: DOC.subtle }}>
                            {p.comment}
                          </span>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td align="right" mono>
                    <span className="font-semibold" style={{ color: DOC.green }}>
                      {MONEY.format(p.amount)} ₴
                    </span>
                  </Td>
                </Tr>
              ))}
              <Tr foot>
                <Td colSpan={2}>
                  <span className="font-semibold" style={{ color: DOC.ink }}>
                    {t.payrollPrint.employee.payoutsTotal}
                  </span>
                </Td>
                <Td align="right" mono>
                  <span className="font-bold" style={{ color: DOC.green }}>
                    {MONEY.format(payouts.reduce((s, p) => s + p.amount, 0))} ₴
                  </span>
                </Td>
              </Tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* Премии */}
      {bonuses.length > 0 && (
        <Section title={t.payrollPrint.employee.bonusesTitle} count={bonuses.length}>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>{t.payrollPrint.employee.colDate}</Th>
                <Th>{t.payrollPrint.employee.colComment}</Th>
                <Th align="right">{t.payrollPrint.employee.colAmount}</Th>
              </Tr>
            </thead>
            <tbody>
              {bonuses.map((b) => (
                <Tr key={b.id}>
                  <Td mono color={DOC.muted}>{fmtDate(b.occurred_on)}</Td>
                  <Td color={DOC.body}>{b.comment ?? t.common.dash}</Td>
                  <Td align="right" mono>
                    <span className="font-semibold" style={{ color: DOC.ink }}>
                      +{MONEY.format(b.amount)} ₴
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  valueColor,
  caption,
}: {
  label: string;
  value: string;
  valueColor?: string;
  caption?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 px-5 py-4"
      style={{ borderLeft: `1px solid ${DOC.hair}` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: DOC.subtle }}>
        {label}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[18px] font-bold leading-none tabular-nums"
        style={{ color: valueColor ?? DOC.ink }}
      >
        {value}
      </span>
      {caption && (
        <span className="text-[10px]" style={{ color: DOC.subtle }}>
          {caption}
        </span>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span style={{ color: DOC.subtle }}>{label}:</span>
      <span className="font-mono font-semibold tabular-nums" style={{ color: DOC.ink }}>
        {value}
      </span>
    </span>
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
          <span className="font-mono text-[11px] tabular-nums" style={{ color: DOC.subtle }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-3 text-[12px]" style={{ color: DOC.muted }}>
      {children}
    </p>
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
  colSpan,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  color?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-2.5 py-2.5 align-top ${mono ? 'whitespace-nowrap font-mono tabular-nums' : ''}`}
      style={{ textAlign: align, color: color ?? DOC.body }}
    >
      {children}
    </td>
  );
}
