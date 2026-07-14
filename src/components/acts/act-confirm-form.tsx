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
  confirmActPaidAction,
  type ConfirmActFields,
  type ConfirmActState,
} from '@/lib/acts/actions';

const INITIAL: ConfirmActState = { ok: false };

export function ActConfirmForm({
  caseId,
  actId,
  defaultAmount,
}: {
  caseId: string;
  actId: string;
  defaultAmount: number;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, formAction] = useActionState<ConfirmActState, FormData>(
    confirmActPaidAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      // После подтверждения акт уходит из issued-списка (ревалидация) — инлайн
      // баннер исчез бы вместе с формой, тост переживает перерисовку.
      toast.success(t.acts.confirm.success);
    }
  }, [state.ok, toast, t.acts.confirm.success]);

  useShakeInvalidFields(formRef, state);

  const err = (f: ConfirmActFields) => state.fieldErrors?.[f];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="act_id" value={actId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.acts.confirm.amountLabel} htmlFor={`confirm-amount-${actId}`} error={err('amount')} required>
          <Input
            id={`confirm-amount-${actId}`}
            name="amount"
            inputMode="decimal"
            defaultValue={String(defaultAmount)}
            required
            aria-invalid={err('amount') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.acts.confirm.paidAtLabel} htmlFor={`confirm-date-${actId}`} error={err('paid_at')} required>
          <Input
            id={`confirm-date-${actId}`}
            name="paid_at"
            type="date"
            defaultValue={today}
            required
            aria-invalid={err('paid_at') ? 'true' : undefined}
          />
        </Field>
      </div>

      <Field label={t.acts.confirm.scanLabel} htmlFor={`confirm-scan-${actId}`} error={err('file')} required>
        <Input
          id={`confirm-scan-${actId}`}
          name="file"
          type="file"
          required
          aria-invalid={err('file') ? 'true' : undefined}
          className="file:mr-3 file:rounded-full file:border-0 file:bg-primary-subtle file:px-2.5 file:py-1 file:text-[12px] file:font-medium file:text-primary hover:file:bg-primary-subtle/80"
        />
      </Field>

      <p className="text-[11px] text-text-subtle">{t.acts.confirm.hint}</p>

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
      {pending ? t.acts.confirm.submitting : t.acts.confirm.submit}
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
