'use client';

import { useOptimistic } from 'react';
import { Trash2 } from 'lucide-react';

import { AddPaymentDialog } from '@/components/payments/add-payment-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { deletePaymentAction } from '@/lib/payments/actions';
import { formatMoney } from '@/lib/utils';
import type { PaymentWithCreator } from '@/lib/types/db';

// Клиентский список платежей + диалог добавления под одним useOptimistic:
// новый платёж появляется в списке СРАЗУ (полупрозрачной «призрак»-строкой),
// и локальный итог списка пересчитывается. ВАЖНО: плитки долга/переплаты в
// шапке дела НЕ трогаем оптимистично — их считают триггеры БД, и они обновятся
// через revalidate (иначе легко рассинхронить логику долга). После ответа
// сервера revalidate приносит реальный список → useOptimistic ребейзится.
export type OptimisticPaymentInput = {
  /** Стабильный id «призрака» — генерится в payment-form (не в reducer). */
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  note: string | null;
};

type OptimisticPayment = PaymentWithCreator & { pending?: boolean };

interface Props {
  payments: PaymentWithCreator[];
  caseId: string;
  /** Может ли добавлять платёж (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять платёж (RLS DELETE = staff). */
  canManage: boolean;
  /** Переплата клиента (max(0, paid_total − contract_sum)). Показываем, если > 0. */
  overpaid: number;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function PaymentsList({
  payments,
  caseId,
  canWrite,
  canManage,
  overpaid,
}: Props) {
  const { t, fmt } = useI18n();
  const b = t.payments.block;

  const [optimistic, addOptimistic] = useOptimistic(
    payments as OptimisticPayment[],
    (state, input: OptimisticPaymentInput) => [
      {
        id: input.id,
        case_id: caseId,
        amount: input.amount,
        paid_at: input.paid_at,
        method: input.method,
        note: input.note,
        created_by: '',
        created_at: new Date().toISOString(),
        idempotency_key: null,
        creator: null,
        pending: true,
      },
      ...state,
    ],
  );

  const total = optimistic.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="mt-4 border-t border-border pt-3">
      {/* Заголовок: «Платежи · N» + итог (оптимистичные). */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold text-text">
          {b.heading}
          <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] text-text-subtle">
            {optimistic.length}
          </span>
        </span>
        {optimistic.length > 0 && (
          <span className="text-[12px] tabular-nums text-text-muted">
            {b.total}{' '}
            <span className="font-mono font-bold text-success-text">
              {formatMoney(total)} ₴
            </span>
          </span>
        )}
      </div>

      {overpaid > 0 && (
        <p
          className="mb-2 inline-flex rounded-full bg-info-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-info"
          title={b.overpaidTitle}
        >
          {fmt(b.overpaid, { amount: formatMoney(overpaid) })}
        </p>
      )}

      {optimistic.length === 0 ? (
        <p className="mb-2.5 text-[12px] text-text-subtle">
          {canWrite ? b.emptyCanWrite : b.empty}
        </p>
      ) : (
        <ul className="mb-3 max-h-60 overflow-y-auto pr-1">
          {optimistic.map((p) => (
            <li
              key={p.id}
              className={
                'group flex items-center gap-2 border-b border-border py-1.5 last:border-0' +
                (p.pending ? ' opacity-60' : '')
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[13px] font-bold tabular-nums text-success-text">
                    {formatMoney(p.amount)} ₴
                  </span>
                  <span className="text-[11.5px] tabular-nums text-text-subtle">
                    {p.pending
                      ? t.payments.form.submitting
                      : DATE_FMT.format(new Date(p.paid_at + 'T00:00:00Z'))}
                  </span>
                </div>
                {(p.method || p.note) && (
                  <p className="truncate text-[11.5px] text-text-muted">
                    {[p.method, p.note].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {canManage && !p.pending && (
                <form action={deletePaymentAction} className="shrink-0">
                  <input type="hidden" name="payment_id" value={p.id} />
                  <input type="hidden" name="case_id" value={p.case_id} />
                  <button
                    type="submit"
                    aria-label={t.payments.row.deleteLabel}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-error-bg hover:text-error focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && <AddPaymentDialog caseId={caseId} addOptimistic={addOptimistic} />}
    </div>
  );
}
