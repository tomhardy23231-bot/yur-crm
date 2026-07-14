'use client';

import { useActionState, useRef, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  createActAction,
  type CreateActFields,
  type CreateActState,
} from '@/lib/acts/actions';

const INITIAL: CreateActState = { ok: false };

export function ActCreateForm({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, formAction] = useActionState<CreateActState, FormData>(
    createActAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success(t.acts.create.success);
    }
  }, [state.ok, toast, t.acts.create.success]);

  useShakeInvalidFields(formRef, state);

  const err = (f: CreateActFields) => state.fieldErrors?.[f];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label={t.acts.create.serviceNameLabel} htmlFor="act-service" error={err('service_name')}>
          <Input
            id="act-service"
            name="service_name"
            defaultValue="Юридичні послуги"
            placeholder={t.acts.create.serviceNamePlaceholder}
            aria-invalid={err('service_name') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.acts.create.amountLabel} htmlFor="act-amount" error={err('amount')} required>
          <Input
            id="act-amount"
            name="amount"
            inputMode="decimal"
            required
            aria-invalid={err('amount') ? 'true' : undefined}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.acts.create.servicePeriodLabel} htmlFor="act-period" error={err('service_period')}>
          <Input
            id="act-period"
            name="service_period"
            placeholder={t.acts.create.servicePeriodPlaceholder}
            aria-invalid={err('service_period') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.acts.create.noteLabel} htmlFor="act-note" error={err('note')}>
          <Input
            id="act-note"
            name="note"
            placeholder={t.acts.create.notePlaceholder}
            aria-invalid={err('note') ? 'true' : undefined}
          />
        </Field>
      </div>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-control border border-error/15 bg-error-bg px-3 py-2 text-sm text-error-text">
          {state.message}
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
      {pending ? t.acts.create.submitting : t.acts.create.submit}
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
