'use client';

import { Pencil } from 'lucide-react';
import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccountPick } from '@/lib/db/rpc';
import {
  updatePaymentAction,
  type UpdatePaymentFields,
  type UpdatePaymentState,
} from '@/lib/payments/actions';
import type { PaymentWithCreator } from '@/lib/types/db';
import { workDateBounds } from '@/lib/validation';

const INITIAL: UpdatePaymentState = { ok: false };

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
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;

  const [state, formAction, pending] = useActionState<UpdatePaymentState, FormData>(
    updatePaymentAction,
    INITIAL,
  );
  const handledRef = useRef<UpdatePaymentState | null>(null);

  useEffect(() => {
    if (!state.ok || handledRef.current === state) return;
    handledRef.current = state;
    toast.success(t.payments.row.updated);
    close();
  }, [state, toast, t, close]);

  const err = (f: UpdatePaymentFields) => state.fieldErrors?.[f];
  // Платёж от акта: сумма и дата заблокированы (их держит триггер БД).
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
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="payment_id" value={payment.id} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.payments.form.amountLabel} htmlFor={fid('amount')} error={err('amount')}>
              <Input
                id={fid('amount')}
                name="amount"
                type="text"
                inputMode="decimal"
                maxLength={16}
                required
                readOnly={locked}
                defaultValue={String(payment.amount)}
                className="tabular-nums"
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
                  if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
                }}
              />
            </Field>

            <Field label={t.payments.form.paidAtLabel} htmlFor={fid('paid')} error={err('paid_at')}>
              <Input
                id={fid('paid')}
                name="paid_at"
                type="date"
            {...workDateBounds()}
                required
                readOnly={locked}
                defaultValue={payment.paid_at}
              />
            </Field>
          </div>

          {accounts.length > 0 ? (
            <Field label={t.payments.form.accountLabel} htmlFor={fid('acc')} error={err('method')}>
              <Select
                id={fid('acc')}
                name="account_id"
                defaultValue={payment.account_id ?? accounts[0]!.id}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={t.payments.form.methodLabel} htmlFor={fid('method')} error={err('method')}>
              <Input
                id={fid('method')}
                name="method"
                type="text"
                maxLength={80}
                defaultValue={payment.method ?? ''}
                placeholder={t.payments.form.methodPlaceholder}
              />
            </Field>
          )}

          <Field label={t.payments.form.noteLabel} htmlFor={fid('note')} error={err('note')}>
            <Textarea
              id={fid('note')}
              name="note"
              rows={2}
              maxLength={500}
              defaultValue={payment.note ?? ''}
              placeholder={t.payments.form.notePlaceholder}
            />
          </Field>

          {state.message && !state.ok && (
            <p role="alert" className="text-[12px] text-error">
              {state.message}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t.payments.form.submitting : t.payments.row.editSave}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              {t.common.cancel}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[12px] text-text-muted">
        {label}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
