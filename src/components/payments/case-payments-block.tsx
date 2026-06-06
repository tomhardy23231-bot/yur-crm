import { Plus, Wallet } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listPaymentsByCase } from '@/lib/payments/queries';

import { PaymentForm } from './payment-form';
import { PaymentRow } from './payment-row';

interface CasePaymentsBlockProps {
  caseId: string;
  /** Может ли пользователь добавлять платёж (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять (RLS DELETE = staff-only). */
  canManage: boolean;
  /** Переплата клиента (max(0, paid_total − contract_sum)). Показываем, если > 0. */
  overpaid?: number;
}

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export async function CasePaymentsBlock({
  caseId,
  canWrite,
  canManage,
  overpaid = 0,
}: CasePaymentsBlockProps) {
  const { t, fmt, plural } = await getT();
  const payments = await listPaymentsByCase(caseId);
  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.payments.block.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.payments.block.count, payments.length)}
        </span>
        <span className="ml-auto inline-flex items-center gap-3">
          {overpaid > 0 && (
            <span
              className="rounded-full bg-info-bg px-2.5 py-0.5 text-[12px] font-semibold text-info"
              title={t.payments.block.overpaidTitle}
            >
              {fmt(t.payments.block.overpaid, { amount: MONEY_FMT.format(overpaid) })}
            </span>
          )}
          {payments.length > 0 && (
            <span className="text-[13px] font-mono tabular-nums text-text">
              {t.payments.block.total}{' '}
              <span className="font-bold text-success">
                {MONEY_FMT.format(total)} ₴
              </span>
            </span>
          )}
        </span>
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            {t.payments.block.addPayment}
          </summary>
          <div className="px-5 pb-5 pt-1">
            <PaymentForm caseId={caseId} />
          </div>
        </details>
      )}

      {payments.length === 0 ? (
        <EmptyState
          canWrite={canWrite}
          emptyCanWrite={t.payments.block.emptyCanWrite}
          empty={t.payments.block.empty}
        />
      ) : (
        <div>
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} canManage={canManage} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmptyState({
  canWrite,
  emptyCanWrite,
  empty,
}: {
  canWrite: boolean;
  emptyCanWrite: string;
  empty: string;
}) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">
        {canWrite ? emptyCanWrite : empty}
      </p>
    </div>
  );
}
