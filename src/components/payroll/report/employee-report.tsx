import Link from 'next/link';

import {
  CASE_CATEGORY_LABEL,
  CASE_STAGE_LABEL,
  ROLE_IN_CASE_LABEL,
} from '@/lib/types/db';
import type { EmployeeReport } from '@/lib/payroll/report';
import { DOC } from '@/components/payroll/report/report-document';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const PAY_METHOD: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Банк. перевод',
  transfer: 'Перевод',
  other: 'Прочее',
};

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

export function EmployeeReportBody({ report }: { report: EmployeeReport }) {
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
          <Kpi label="Начислено за месяц" value={`${MONEY.format(earnedMonth)} ₴`} />
          <Kpi label="Премии за месяц" value={`${bonusMonth > 0 ? '+' : ''}${MONEY.format(bonusMonth)} ₴`} />
          <Kpi label="Выплачено за месяц" value={`${MONEY.format(payoutMonth)} ₴`} valueColor={DOC.green} />
          <Kpi
            label="К выплате (всего)"
            value={`${MONEY.format(balance)} ₴`}
            valueColor={DOC.amber}
            caption={`дела ${MONEY.format(casesOutstandingAll)} ₴ · премии ${MONEY.format(bonusOutstandingAll)} ₴`}
          />
        </div>
        {/* Доп. показатели */}
        <div
          className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-[11.5px]"
          style={{ color: DOC.muted }}
        >
          <Metric label="Дел за месяц" value={String(casesCount)} />
          <Metric label="Поступления клиентов" value={`${MONEY.format(clientPaidTotal)} ₴`} />
          <Metric label="Сумма договоров" value={`${MONEY.format(contractSumTotal)} ₴`} />
          {lawyerEarned > 0 && <Metric label="Начислено как юрист" value={`${MONEY.format(lawyerEarned)} ₴`} />}
          {expertEarned > 0 && <Metric label="Начислено как эксперт" value={`${MONEY.format(expertEarned)} ₴`} />}
        </div>
      </section>

      {/* Дела и начисления */}
      <Section title="Дела и начисления" count={cases.length}>
        {cases.length === 0 ? (
          <Empty>За выбранный период оплат по делам не поступало — начислений нет.</Empty>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>Дело / клиент</Th>
                <Th>Категория · этап</Th>
                <Th>Роль · ставка</Th>
                <Th align="right">Оплачено клиентом</Th>
                <Th align="right">Начислено</Th>
                <Th align="right">Выплачено</Th>
                <Th align="right">Остаток</Th>
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
                    {c.category ? CASE_CATEGORY_LABEL[c.category] : '—'}
                    <div className="text-[11px]" style={{ color: DOC.subtle }}>
                      {CASE_STAGE_LABEL[c.stage]}
                    </div>
                  </Td>
                  <Td color={DOC.muted}>
                    {ROLE_IN_CASE_LABEL[c.role_in_case]}
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
                    Итого за период
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
        <Section title="Поступления от клиентов за период" count={clientPayments.length}>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>Дата</Th>
                <Th>Дело</Th>
                <Th>Способ</Th>
                <Th align="right">Сумма</Th>
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
                  <Td color={DOC.muted}>{p.method ? (PAY_METHOD[p.method] ?? p.method) : '—'}</Td>
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
                    Всего поступлений
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
      <Section title="Выплаты сотруднику за период" count={payouts.length}>
        {payouts.length === 0 ? (
          <Empty>За выбранный период выплат сотруднику не зафиксировано.</Empty>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>Дата</Th>
                <Th>Назначение</Th>
                <Th align="right">Сумма</Th>
              </Tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <Tr key={p.id}>
                  <Td mono color={DOC.muted}>{fmtDate(p.occurred_on)}</Td>
                  <Td>
                    {p.allocations.length === 0 && p.bonusPortion <= 0.001 && !p.comment ? (
                      <span style={{ color: DOC.muted }}>—</span>
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
                            Премия{' '}
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
                    Всего выплачено за период
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
        <Section title="Премии за период" count={bonuses.length}>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <Tr head>
                <Th>Дата</Th>
                <Th>Комментарий</Th>
                <Th align="right">Сумма</Th>
              </Tr>
            </thead>
            <tbody>
              {bonuses.map((b) => (
                <Tr key={b.id}>
                  <Td mono color={DOC.muted}>{fmtDate(b.occurred_on)}</Td>
                  <Td color={DOC.body}>{b.comment ?? '—'}</Td>
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
