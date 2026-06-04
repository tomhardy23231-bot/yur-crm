'use client';

import { useActionState, useRef, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
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

// Задача 9c: клиентская валидация суммы — зеркалит серверную parseAmount.
// Допускаем точку и запятую, до 2 знаков, строго > 0 и в пределах numeric(14,2).
function parseAmountClient(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000_000_000) return null;
  return n;
}

export function PaymentForm({ caseId }: Props) {
  const { t } = useI18n();
  const [state, formAction, isPending] = useActionState<CreatePaymentState, FormData>(
    createPaymentAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Ключ идемпотентности (Задача 2): СТАБИЛЕН на один экземпляр формы. Генерится
  // один раз (лениво, в момент первой отправки — без hydration-mismatch) и
  // переиспользуется при повторных кликах, пока платёж не сохранён успешно.
  // Тогда мульти-сабмит (несколько кликов за <16 мс) уходит с ОДНИМ ключом →
  // уникальный индекс payments.idempotency_key отсекает дубль на уровне БД.
  const idemKeyRef = useRef<string | null>(null);
  // Клиентская ошибка суммы (Задача 9c) — до обращения к серверу.
  const [amountError, setAmountError] = useState<string | undefined>();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // Платёж сохранён — следующий получит свежий ключ идемпотентности.
      // (amountError сюда не сбрасываем: успешный submit возможен только когда
      // сумма уже валидна, т.е. amountError и так undefined — см. submit-хендлер.)
      idemKeyRef.current = null;
    }
  }, [state.ok]);

  useShakeInvalidFields(formRef, state);

  function submitWithIdempotencyKey(formData: FormData) {
    // Клиентская валидация суммы: не пускаем «мусор» и неположительные значения.
    const amountRaw = String(formData.get('amount') ?? '');
    if (parseAmountClient(amountRaw) === null) {
      setAmountError(t.payments.form.amountInvalid);
      return;
    }
    setAmountError(undefined);
    // Ленивая генерация стабильного ключа (один раз на экземпляр формы).
    if (idemKeyRef.current === null) {
      idemKeyRef.current = crypto.randomUUID();
    }
    formData.set('idempotency_key', idemKeyRef.current);
    return formAction(formData);
  }

  function err(field: CreatePaymentFields): string | undefined {
    if (field === 'amount') return state.fieldErrors?.amount ?? amountError;
    return state.fieldErrors?.[field];
  }

  return (
    <form
      ref={formRef}
      action={submitWithIdempotencyKey}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_1fr_1fr]">
        <Field
          label={t.payments.form.amountLabel}
          htmlFor="payment-amount"
          error={err('amount')}
          required
        >
          <Input
            id="payment-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder={t.payments.form.amountPlaceholder}
            required
            maxLength={16}
            // Задача 9c: пускаем только цифры и разделитель — «мусор» (буквы,
            // символы) отсекается прямо при вводе; полная проверка — на submit.
            onChange={(e) => {
              const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
              if (cleaned !== e.currentTarget.value) {
                e.currentTarget.value = cleaned;
              }
              if (amountError) setAmountError(undefined);
            }}
            aria-invalid={err('amount') ? 'true' : undefined}
            className="font-mono tabular-nums"
          />
        </Field>

        <Field
          label={t.payments.form.paidAtLabel}
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
          label={t.payments.form.methodLabel}
          htmlFor="payment-method"
          error={err('method')}
        >
          <Input
            id="payment-method"
            name="method"
            type="text"
            maxLength={80}
            placeholder={t.payments.form.methodPlaceholder}
            aria-invalid={err('method') ? 'true' : undefined}
          />
        </Field>
      </div>

      <Field
        label={t.payments.form.noteLabel}
        htmlFor="payment-note"
        error={err('note')}
      >
        <Textarea
          id="payment-note"
          name="note"
          maxLength={500}
          rows={2}
          placeholder={t.payments.form.notePlaceholder}
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
          {t.payments.form.saved}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton
          pending={isPending}
          submitLabel={t.payments.form.submit}
          submittingLabel={t.payments.form.submitting}
        />
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
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  pending,
  submitLabel,
  submittingLabel,
}: {
  pending: boolean;
  submitLabel: string;
  submittingLabel: string;
}) {
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? submittingLabel : submitLabel}
    </Button>
  );
}
