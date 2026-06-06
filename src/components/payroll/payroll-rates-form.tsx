'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import {
  updatePayrollRatesAction,
  type PayrollRatesActionState,
} from '@/lib/payroll/actions';
import { CASE_CATEGORIES, type CaseCategory } from '@/lib/types/db';

const INITIAL: PayrollRatesActionState = { ok: false };

export type CategoryRatePair = { lawyer: number; expert: number };

export function PayrollRatesForm({
  rates,
}: {
  rates: Record<CaseCategory, CategoryRatePair>;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction] = useActionState<PayrollRatesActionState, FormData>(
    updatePayrollRatesAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CASE_CATEGORIES.map((c) => (
          <div
            key={c}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/40 p-4"
          >
            <span className="text-[13px] font-semibold text-text">
              {t.enums.caseCategory[c]}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`lawyer_percent_${c}`}
                  className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle"
                >
                  {t.payroll.settings.lawyerPercent}
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
                  aria-label={fmt(t.payroll.settings.lawyerRateAria, {
                    category: t.enums.caseCategory[c],
                  })}
                  className=""
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`expert_percent_${c}`}
                  className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle"
                >
                  {t.payroll.settings.expertPercent}
                </Label>
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
                  aria-label={fmt(t.payroll.settings.expertRateAria, {
                    category: t.enums.caseCategory[c],
                  })}
                  className=""
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {state.message && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={
            state.ok
              ? 'text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2'
              : 'text-[13px] text-error bg-error-bg border border-error/20 rounded-md px-3 py-2 animate-field-error'
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
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t.payroll.settings.saving : t.payroll.settings.saveRates}
    </Button>
  );
}
