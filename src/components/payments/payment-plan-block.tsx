import { CalendarClock, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/utils';
import { kyivToday } from '@/lib/payroll/month';
import { listPlanItems } from '@/lib/payments/queries';
import { planWithStatuses, type PlanItemStatus } from '@/lib/payments/plan';

import { PlanAddForm } from './plan-add-form';
import { DeletePlanItemButton } from './plan-row-controls';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

const STATUS_TONE: Record<PlanItemStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  paid: 'success',
  overdue: 'error',
  pending: 'neutral',
};

interface PaymentPlanBlockProps {
  caseId: string;
  /** Сумма оплат по делу (cases.paid_total) — база накопительного покрытия. */
  paidTotal: number;
  /** Может ли добавлять/удалять позиции (RLS = can_write_case). */
  canWrite: boolean;
}

// График платежей (v3 Сессия 9): плановые доплаты по делу. Статус позиции
// (оплачено/ожидает/просрочено) считается из cases.paid_total накопительно
// (чистая логика lib/payments/plan.ts). Серверный компонент — только выборка и
// рендер; форма/удаление — клиентские (PlanAddForm/DeletePlanItemButton).
export async function PaymentPlanBlock({
  caseId,
  paidTotal,
  canWrite,
}: PaymentPlanBlockProps) {
  const { t, fmt, plural } = await getT();
  const p = t.payments.plan;
  const items = await listPlanItems(caseId);

  const statuses = planWithStatuses(
    items.map((i) => ({
      id: i.id,
      due_date: i.due_date,
      amount: i.amount,
      created_at: i.created_at,
    })),
    paidTotal,
    kyivToday(),
  );
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const totalPlanned = items.reduce((s, i) => s + i.amount, 0);
  const totalCovered = statuses.reduce((s, r) => s + r.coveredAmount, 0);
  const coveredPct =
    totalPlanned > 0
      ? Math.min(100, Math.round((totalCovered / totalPlanned) * 100))
      : 0;

  const statusLabel: Record<PlanItemStatus, string> = {
    paid: p.statusPaid,
    pending: p.statusPending,
    overdue: p.statusOverdue,
  };

  return (
    <Card id="plan" className="scroll-mt-20">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <CalendarClock size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{p.heading}</h2>
        <span className="text-[12px] text-text-muted">· {plural(p.count, items.length)}</span>
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="inline-flex w-full cursor-pointer list-none items-center gap-2 px-5 py-3 text-[13px] font-medium text-primary transition-colors hover:bg-primary-subtle/50">
            <Plus size={14} strokeWidth={2} className="transition-transform group-open:rotate-45" />
            {p.addSummary}
          </summary>
          <div className="px-5 pb-5 pt-1">
            <PlanAddForm caseId={caseId} />
          </div>
        </details>
      )}

      {items.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="mx-auto max-w-md text-[13px] text-text-muted">
            {canWrite ? p.empty : p.emptyReadonly}
          </p>
        </div>
      ) : (
        <>
          {/* Прогресс покрытия графика оплатами по делу. */}
          <div className="border-b border-border px-5 py-3">
            <div className="mb-1.5 flex items-center justify-between text-[12px] tabular-nums">
              <span className="font-medium text-text-muted">
                {fmt(p.covered, {
                  covered: formatMoney(totalCovered),
                  total: formatMoney(totalPlanned),
                })}
              </span>
              <span className="text-text-subtle">{coveredPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-success transition-[width] duration-300"
                style={{ width: `${coveredPct}%` }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.03em] text-text-subtle">
                <th className="px-5 py-2 font-medium">{p.colDate}</th>
                <th className="py-2 text-right font-medium">{p.colAmount}</th>
                <th className="py-2 pl-4 font-medium">{p.colStatus}</th>
                <th className="py-2 pl-4 font-medium">{p.colNote}</th>
                {canWrite && <th className="px-5 py-2" />}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const st = statusById.get(item.id);
                const status = st?.status ?? 'pending';
                const covered = st?.coveredAmount ?? 0;
                const partial = covered > 0 && covered < item.amount;
                return (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5 tabular-nums text-text">{fmtDate(item.due_date)}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-text">
                      {formatMoney(item.amount)} ₴
                    </td>
                    <td className="py-2.5 pl-4">
                      <div className="flex flex-col gap-0.5">
                        <Badge tone={STATUS_TONE[status]} quiet={status !== 'overdue'}>
                          {statusLabel[status]}
                        </Badge>
                        {partial && (
                          <span className="text-[11px] tabular-nums text-text-subtle">
                            {fmt(p.coveredPartial, { covered: formatMoney(covered) })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pl-4 text-text-muted">
                      {item.note ? <span className="break-words">{item.note}</span> : '—'}
                    </td>
                    {canWrite && (
                      <td className="px-5 py-2.5 text-right">
                        <DeletePlanItemButton caseId={caseId} itemId={item.id} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Card>
  );
}
