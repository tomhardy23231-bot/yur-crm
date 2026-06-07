'use client';

import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';

import { PaymentForm } from './payment-form';
import type { OptimisticPaymentInput } from './payments-list';

interface Props {
  caseId: string;
  /** Оптимистичное добавление строки в список (из PaymentsList). */
  addOptimistic?: (input: OptimisticPaymentInput) => void;
}

// Быстрое добавление платежа из шапки дела: кнопка-триггер + модалка с формой.
// Форма переиспользуется из блока «Финансы»; её экшен делает revalidatePath по
// делу, поэтому после сохранения обновятся плитки сумм, список платежей и
// «Вознаграждение команды». На успехе модалка закрывается.
export function AddPaymentDialog({ caseId, addOptimistic }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Plus size={14} strokeWidth={2.25} />
        {t.payments.addDialog.trigger}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.payments.addDialog.title}
        subtitle={t.payments.addDialog.subtitle}
        closeLabel={t.payments.addDialog.close}
      >
        <PaymentForm caseId={caseId} onSuccess={close} addOptimistic={addOptimistic} />
      </Modal>
    </>
  );
}
