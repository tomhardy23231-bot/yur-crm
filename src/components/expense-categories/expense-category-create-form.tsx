'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import {
  createExpenseCategoryAction,
  type ExpenseCategoryFormState,
} from '@/lib/expenses/category-actions';

const INITIAL: ExpenseCategoryFormState = { ok: false };

export function ExpenseCategoryCreateForm() {
  const { t } = useI18n();
  const [state, formAction] = useActionState<ExpenseCategoryFormState, FormData>(
    createExpenseCategoryAction,
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
          <Label htmlFor="expense-category-name" className="text-[12px] text-text-muted">
            {t.expenseCategories.create.nameLabel}
          </Label>
          <Input
            id="expense-category-name"
            name="name"
            type="text"
            maxLength={60}
            placeholder={t.expenseCategories.create.namePlaceholder}
            required
            aria-invalid={state.fieldError ? 'true' : undefined}
          />
        </div>
        <SubmitButton />
      </div>

      {state.fieldError && (
        <p className="animate-field-error text-[12px] text-error" role="alert">
          {state.fieldError}
        </p>
      )}
      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
        >
          {state.message}
        </p>
      )}
      {state.ok && state.message && (
        <p
          role="status"
          className="rounded-md border border-success/15 bg-success-bg px-3 py-2 text-sm text-success"
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
      {pending
        ? t.expenseCategories.create.submitting
        : t.expenseCategories.create.submit}
    </Button>
  );
}
