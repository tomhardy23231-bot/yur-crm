'use client';

import { Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccountPick } from '@/lib/db/rpc';
import type { PaymentWithCreator } from '@/lib/types/db';

import { PaymentEditForm } from './payment-edit-form';

// Правка внесённого платежа (2026-07-27, просьба владельца «на всякий случай»).
// Право edit_payments; строка кассы пересоздастся триггером сама.
// Платёж, созданный подтверждением акта, в БД защищён: сумму и дату у него
// менять нельзя — форма показывает их только для чтения.
export function EditPaymentDialog({
  payment,
  accounts = [],
}: {
  payment: PaymentWithCreator;
  accounts?: CashAccountPick[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const locked = payment.act_id !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.payments.row.editLabel}
        title={t.payments.row.editLabel}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-primary-softer hover:text-primary-pressed focus:opacity-100 group-hover:opacity-100"
      >
        <Pencil size={13} strokeWidth={1.75} />
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.payments.row.editTitle}
        subtitle={locked ? t.payments.row.editActHint : undefined}
        closeLabel={t.common.close}
      >
        <PaymentEditForm payment={payment} accounts={accounts} onSuccess={close} />
      </Modal>
    </>
  );
}
