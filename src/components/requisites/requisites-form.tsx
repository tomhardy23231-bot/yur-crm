'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import {
  updateOrgRequisitesAction,
  type RequisitesField,
  type RequisitesState,
} from '@/lib/org/actions';
import type { OrgRequisites } from '@/lib/types/db';

const INITIAL: RequisitesState = { ok: false };

export function RequisitesForm({ requisites }: { requisites: OrgRequisites }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<RequisitesState, FormData>(
    updateOrgRequisitesAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useShakeInvalidFields(formRef, state);

  const err = (f: RequisitesField) => state.fieldErrors?.[f];
  const f = t.requisites.fields;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Field label={f.orgName} htmlFor="org_name" error={err('org_name')} required>
        <Input id="org_name" name="org_name" defaultValue={requisites.org_name} aria-invalid={err('org_name') ? 'true' : undefined} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={f.edrpou} htmlFor="edrpou" error={err('edrpou')}>
          <Input id="edrpou" name="edrpou" defaultValue={requisites.edrpou} />
        </Field>
        <Field label={f.phone} htmlFor="phone" error={err('phone')}>
          <Input id="phone" name="phone" defaultValue={requisites.phone} />
        </Field>
      </div>

      <Field label={f.address} htmlFor="address" error={err('address')}>
        <Input id="address" name="address" defaultValue={requisites.address} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={f.iban} htmlFor="iban" error={err('iban')}>
          <Input id="iban" name="iban" defaultValue={requisites.iban} />
        </Field>
        <Field label={f.bankName} htmlFor="bank_name" error={err('bank_name')}>
          <Input id="bank_name" name="bank_name" defaultValue={requisites.bank_name} />
        </Field>
        <Field label={f.mfo} htmlFor="mfo" error={err('mfo')}>
          <Input id="mfo" name="mfo" defaultValue={requisites.mfo} />
        </Field>
      </div>

      <Field label={f.taxStatus} htmlFor="tax_status" error={err('tax_status')}>
        <Textarea
          id="tax_status"
          name="tax_status"
          rows={3}
          defaultValue={requisites.tax_status_lines.join('\n')}
        />
        <p className="text-[11px] text-text-subtle">{f.taxStatusHint}</p>
      </Field>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error">
          {state.message}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border border-success/15 bg-success-bg px-3 py-2 text-sm text-success">
          {t.requisites.success}
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
    <Button type="submit" disabled={pending}>
      {pending ? t.requisites.saving : t.requisites.save}
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
      <Label htmlFor={htmlFor} className="text-[12px] uppercase tracking-[0.04em] text-text-muted">
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
