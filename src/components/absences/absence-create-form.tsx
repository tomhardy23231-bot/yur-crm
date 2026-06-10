'use client';

import { useActionState, useRef, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import {
  createAbsenceAction,
  type CreateAbsenceFields,
  type CreateAbsenceState,
} from '@/lib/absences/actions';
import { ABSENCE_KINDS } from '@/lib/types/db';

const INITIAL: CreateAbsenceState = { ok: false };

export function AbsenceCreateForm({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<CreateAbsenceState, FormData>(
    createAbsenceAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  useShakeInvalidFields(formRef, state);

  const err = (f: CreateAbsenceFields) => state.fieldErrors?.[f];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="user_id" value={userId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <Field label={t.absences.create.kindLabel} htmlFor="absence-kind" error={err('kind')}>
          <Select id="absence-kind" name="kind" defaultValue="vacation" aria-invalid={err('kind') ? 'true' : undefined}>
            {ABSENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.enums.absenceKind[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.absences.create.startLabel} htmlFor="absence-start" error={err('starts_on')} required>
          <Input
            id="absence-start"
            name="starts_on"
            type="date"
            required
            aria-invalid={err('starts_on') ? 'true' : undefined}
          />
        </Field>
        <Field label={t.absences.create.endLabel} htmlFor="absence-end" error={err('ends_on')} required>
          <Input
            id="absence-end"
            name="ends_on"
            type="date"
            required
            aria-invalid={err('ends_on') ? 'true' : undefined}
          />
        </Field>
      </div>

      <Field label={t.absences.create.noteLabel} htmlFor="absence-note" error={err('note')}>
        <Input
          id="absence-note"
          name="note"
          placeholder={t.absences.create.notePlaceholder}
          aria-invalid={err('note') ? 'true' : undefined}
        />
      </Field>

      {state.message && !state.ok && (
        <p role="alert" className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error">
          {state.message}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border border-success/15 bg-success-bg px-3 py-2 text-sm text-success">
          {t.absences.create.success}
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
      {pending ? t.absences.create.submitting : t.absences.create.submit}
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
