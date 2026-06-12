'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import {
  createDepartmentAction,
  type DepartmentFormState,
} from '@/lib/departments/actions';

const INITIAL: DepartmentFormState = { ok: false };

export function DepartmentCreateForm() {
  const { t } = useI18n();
  const [state, formAction] = useActionState<DepartmentFormState, FormData>(
    createDepartmentAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label
            htmlFor="dept-name"
            className="text-[12px] text-text-muted"
          >
            {t.departments.create.nameLabel}
          </Label>
          <Input
            id="dept-name"
            name="name"
            type="text"
            maxLength={100}
            placeholder={t.departments.create.namePlaceholder}
            required
            aria-invalid={state.fieldError ? 'true' : undefined}
          />
        </div>
        <SubmitButton />
      </div>

      {state.fieldError && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {state.fieldError}
        </p>
      )}
      {state.message && !state.ok && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}
      {state.ok && state.message && (
        <p
          role="status"
          className="text-sm text-success bg-success-bg border border-success/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm" className="shrink-0">
      <Plus size={14} strokeWidth={2} />
      {pending ? t.departments.create.submitting : t.departments.create.submit}
    </Button>
  );
}
