'use client';

import { useActionState, useRef, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import {
  createPlanItemAction,
  type CreatePlanItemFields,
  type CreatePlanItemState,
} from '@/lib/payments/actions';

const INITIAL: CreatePlanItemState = { ok: false };

// Форма добавления плановой доплаты (дата + сумма + примечание). Видна тем, кто
// пишет в дело (гейт в блоке). useActionState + reset после успеха — как у актов.
export function PlanAddForm({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<CreatePlanItemState, FormData>(
    createPlanItemAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  useShakeInvalidFields(formRef, state);

  const err = (f: CreatePlanItemFields) => state.fieldErrors?.[f];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <Field label={t.payments.plan.dueDateLabel} htmlFor="plan-due" error={err('due_date')} required>
          <Input
            id="plan-due"
            name="due_date"
            type="date"
            required
            aria-invalid={err('due_date') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.payments.plan.amountLabel} htmlFor="plan-amount" error={err('amount')} required>
          <Input
            id="plan-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            aria-invalid={err('amount') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.payments.plan.noteLabel} htmlFor="plan-note" error={err('note')}>
          <Input
            id="plan-note"
            name="note"
            placeholder={t.payments.plan.notePlaceholder}
            aria-invalid={err('note') ? 'true' : undefined}
          />
        </Field>
      </div>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error">
          {state.message}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border border-success/15 bg-success-bg px-3 py-2 text-sm text-success">
          {t.payments.plan.success}
        </p>
      )}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? t.payments.plan.submitting : t.payments.plan.submit}
    </Button>
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
      <Label htmlFor={htmlFor} className="text-[12px] text-text-muted">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </Label>
      {children}
      {error && (
        <p className="animate-field-error text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
