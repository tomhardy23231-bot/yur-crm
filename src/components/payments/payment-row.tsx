import { Banknote, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { deletePaymentAction } from '@/lib/payments/actions';
import type { PaymentWithCreator } from '@/lib/types/db';

interface PaymentRowProps {
  payment: PaymentWithCreator;
  /** Может ли пользователь удалить платёж (DELETE RLS = is_staff). */
  canManage: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function PaymentRow({ payment, canManage }: PaymentRowProps) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted/50 transition-colors duration-[120ms] ease-out">
      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-md bg-success-bg text-success">
        <Banknote size={16} strokeWidth={1.75} />
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[16px] font-bold font-mono text-success tabular-nums">
            {MONEY_FMT.format(payment.amount)} ₴
          </span>
          <span className="font-mono text-[12px] text-text-muted tabular-nums">
            {DATE_FMT.format(new Date(payment.paid_at + 'T00:00:00Z'))}
          </span>
          {payment.method && (
            <Badge tone="neutral">{payment.method}</Badge>
          )}
        </div>

        {payment.note && (
          <p className="text-[13px] text-text-muted break-words">{payment.note}</p>
        )}

        {payment.creator && (
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <Avatar name={payment.creator.full_name} size="sm" />
            <span>{payment.creator.full_name}</span>
          </div>
        )}
      </div>

      {canManage && (
        <form action={deletePaymentAction} className="shrink-0">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input type="hidden" name="case_id" value={payment.case_id} />
          <button
            type="submit"
            aria-label="Удалить платёж"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center w-7 h-7 rounded-md text-text-subtle hover:text-error hover:bg-error-bg"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </form>
      )}
    </div>
  );
}
