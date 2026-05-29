'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  updatePayrollRatesAction,
  type PayrollRatesActionState,
} from '@/lib/payroll/actions';
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABEL,
  type CaseCategory,
} from '@/lib/types/db';

const INITIAL: PayrollRatesActionState = { ok: false };

export type CategoryRatePair = { lawyer: number; expert: number };

export function PayrollRatesForm({
  rates,
}: {
  rates: Record<CaseCategory, CategoryRatePair>;
}) {
  const [state, formAction] = useActionState<PayrollRatesActionState, FormData>(
    updatePayrollRatesAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4 px-1">
          <span />
          <span className="w-28 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle text-center">
            Юрист, %
          </span>
          <span className="w-28 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle text-center">
            Эксперт, %
          </span>
        </div>
        {CASE_CATEGORIES.map((c) => (
          <div
            key={c}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
          >
            <Label
              htmlFor={`lawyer_percent_${c}`}
              className="text-[13px] font-medium text-text"
            >
              {CASE_CATEGORY_LABEL[c]}
            </Label>
            <Input
              id={`lawyer_percent_${c}`}
              name={`lawyer_percent_${c}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              defaultValue={String(rates[c].lawyer)}
              required
              aria-label={`${CASE_CATEGORY_LABEL[c]} — ставка юриста, %`}
              className="font-mono sm:w-28"
            />
            <Input
              id={`expert_percent_${c}`}
              name={`expert_percent_${c}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              defaultValue={String(rates[c].expert)}
              required
              aria-label={`${CASE_CATEGORY_LABEL[c]} — ставка эксперта, %`}
              className="font-mono sm:w-28"
            />
          </div>
        ))}
      </div>

      {state.message && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={
            state.ok
              ? 'text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2'
              : 'text-[13px] text-error bg-error-bg border border-error/20 rounded-md px-3 py-2'
          }
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : 'Сохранить ставки'}
    </Button>
  );
}
