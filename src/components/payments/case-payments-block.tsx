import { Plus, Wallet } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { listPaymentsByCase } from '@/lib/payments/queries';

import { PaymentForm } from './payment-form';
import { PaymentRow } from './payment-row';

interface CasePaymentsBlockProps {
  caseId: string;
  /** Может ли пользователь добавлять платёж (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Может ли удалять (RLS DELETE = staff-only). */
  canManage: boolean;
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
}: CasePaymentsBlockProps) {
  const payments = await listPaymentsByCase(caseId);
  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">Платежи</h2>
        <span className="text-[12px] text-text-muted">
          · {payments.length}{' '}
          {plural(payments.length, ['платёж', 'платежа', 'платежей'])}
        </span>
        {payments.length > 0 && (
          <span className="ml-auto text-[13px] font-mono tabular-nums text-text">
            итого{' '}
            <span className="font-bold text-success">
              {MONEY_FMT.format(total)} ₴
            </span>
          </span>
        )}
      </div>

      {canWrite && (
        <details className="group border-b border-border">
          <summary className="cursor-pointer list-none px-5 py-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary hover:bg-primary-subtle/50 transition-colors w-full">
            <Plus
              size={14}
              strokeWidth={2}
              className="transition-transform group-open:rotate-45"
            />
            Добавить платёж
          </summary>
          <div className="px-5 pb-5 pt-1">
            <PaymentForm caseId={caseId} />
          </div>
        </details>
      )}

      {payments.length === 0 ? (
        <EmptyState canWrite={canWrite} />
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

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center text-center">
      <p className="text-[13px] text-text-muted max-w-md">
        {canWrite
          ? 'Платежей пока нет. Добавьте первое поступление — сумма автоматически обновит «Оплачено» и «Долг» по делу.'
          : 'Платежей по этому делу пока нет.'}
      </p>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
