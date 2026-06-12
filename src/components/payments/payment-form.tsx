'use client';

import { useActionState, useId, useRef, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  createPaymentAction,
  type CreatePaymentFields,
  type CreatePaymentState,
} from '@/lib/payments/actions';
import { parseAmount, todayIso } from '@/lib/validation';

import type { OptimisticPaymentInput } from './payments-list';

const INITIAL: CreatePaymentState = { ok: false };

interface Props {
  caseId: string;
  /** Вызывается после успешного сохранения (напр. закрыть модалку). */
  onSuccess?: () => void;
  /** Оптимистичное добавление строки платежа в список (из PaymentsList). */
  addOptimistic?: (input: OptimisticPaymentInput) => void;
}

// Дата по умолчанию и клиентская валидация суммы — общий @/lib/validation
// (parseAmount зеркалит серверную проверку, todayIso — киевская «сегодня»).

export function PaymentForm({ caseId, onSuccess, addOptimistic }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  // Уникальный префикс id полей — форма может быть на странице в нескольких
  // экземплярах (модалка в шапке + блок «Финансы»); без этого id дублируются.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const [state, formAction, isPending] = useActionState<CreatePaymentState, FormData>(
    async (prev, formData) => {
      // Оптимистично добавляем строку в список — ВНУТРИ action useActionState
      // (= внутри transition, иначе useOptimistic ругается). Сумму парсим тем же
      // правилом, что и клиентская валидация; addOptimistic зовём только если
      // сумма валидна (submitWithIdempotencyKey уже отсеял невалидную до сюда).
      if (addOptimistic) {
        const amount = parseAmount(String(formData.get('amount') ?? ''));
        const paidAt = String(formData.get('paid_at') ?? '').trim();
        // Дату валидируем хотя бы на непустоту (клиент строго валидирует только
        // сумму) — иначе «призрак» мигнул бы при пустой/битой дате до отката.
        if (amount !== null && paidAt) {
          addOptimistic({
            id: crypto.randomUUID(),
            amount,
            paid_at: paidAt,
            method: String(formData.get('method') ?? '').trim() || null,
            note: String(formData.get('note') ?? '').trim() || null,
          });
        }
      }
      return createPaymentAction(prev, formData);
    },
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
      // Тост вместо инлайн-баннера: в модалке шапки форма закрывается раньше,
      // чем баннер успели бы увидеть. toast стабилен (useMemo в провайдере).
      toast.success(t.payments.form.saved);
      onSuccess?.();
    }
  }, [state.ok, onSuccess, toast, t.payments.form.saved]);

  useShakeInvalidFields(formRef, state);

  function submitWithIdempotencyKey(formData: FormData) {
    // Клиентская валидация суммы: не пускаем «мусор» и неположительные значения.
    const amountRaw = String(formData.get('amount') ?? '');
    if (parseAmount(amountRaw) === null) {
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
          htmlFor={fid('amount')}
          error={err('amount')}
          required
        >
          <Input
            id={fid('amount')}
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
            className="tabular-nums"
          />
        </Field>

        <Field
          label={t.payments.form.paidAtLabel}
          htmlFor={fid('paid-at')}
          error={err('paid_at')}
          required
        >
          <Input
            id={fid('paid-at')}
            name="paid_at"
            type="date"
            defaultValue={todayIso()}
            required
            aria-invalid={err('paid_at') ? 'true' : undefined}
            className=""
          />
        </Field>

        <Field
          label={t.payments.form.methodLabel}
          htmlFor={fid('method')}
          error={err('method')}
        >
          <Input
            id={fid('method')}
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
        htmlFor={fid('note')}
        error={err('note')}
      >
        <Textarea
          id={fid('note')}
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
        className="text-[12px] text-text-muted"
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
