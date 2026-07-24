'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import {
  createCaseTypeAction,
  type CaseTypeFormState,
} from '@/lib/case-types/actions';

const INITIAL: CaseTypeFormState = { ok: false };

export function CaseTypeCreateForm() {
  const { t } = useI18n();
  const [state, formAction] = useActionState<CaseTypeFormState, FormData>(
    createCaseTypeAction,
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
          <Label htmlFor="case-type-name" className="text-[12px] text-text-muted">
            {t.caseTypes.create.nameLabel}
          </Label>
          <Input
            id="case-type-name"
            name="name"
            type="text"
            maxLength={60}
            placeholder={t.caseTypes.create.namePlaceholder}
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
      {pending ? t.caseTypes.create.submitting : t.caseTypes.create.submit}
    </Button>
  );
}
