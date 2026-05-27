'use client';

import { useActionState, useRef, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createPaymentAction,
  type CreatePaymentFields,
  type CreatePaymentState,
} from '@/lib/payments/actions';

const INITIAL: CreatePaymentState = { ok: false };

interface Props {
  caseId: string;
}

function todayISO(): string {
  // Локальная дата пользователя (для <input type="date" defaultValue>).
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function PaymentForm({ caseId }: Props) {
  const [state, formAction] = useActionState<CreatePaymentState, FormData>(
    createPaymentAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  function err(field: CreatePaymentFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_1fr_1fr]">
        <Field
          label="Сумма, ₴"
          htmlFor="payment-amount"
          error={err('amount')}
          required
        >
          <Input
            id="payment-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            required
            aria-invalid={err('amount') ? 'true' : undefined}
            className="font-mono tabular-nums"
          />
        </Field>

        <Field
          label="Дата оплаты"
          htmlFor="payment-paid-at"
          error={err('paid_at')}
          required
        >
          <Input
            id="payment-paid-at"
            name="paid_at"
            type="date"
            defaultValue={todayISO()}
            required
            aria-invalid={err('paid_at') ? 'true' : undefined}
            className="font-mono"
          />
        </Field>

        <Field
          label="Метод"
          htmlFor="payment-method"
          error={err('method')}
        >
          <Input
            id="payment-method"
            name="method"
            type="text"
            maxLength={80}
            placeholder="Наличные / Безнал / Карта"
            aria-invalid={err('method') ? 'true' : undefined}
          />
        </Field>
      </div>

      <Field
        label="Комментарий"
        htmlFor="payment-note"
        error={err('note')}
      >
        <Textarea
          id="payment-note"
          name="note"
          maxLength={500}
          rows={2}
          placeholder="Опционально"
          aria-invalid={err('note') ? 'true' : undefined}
        />
      </Field>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      {state.ok && (
        <p
          role="status"
          className="text-sm text-success bg-success-bg border border-success/15 rounded-md px-3 py-2"
        >
          Платёж сохранён.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? 'Сохранение…' : 'Добавить платёж'}
    </Button>
  );
}
