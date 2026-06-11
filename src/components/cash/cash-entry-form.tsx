'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccount } from '@/lib/types/db';
import { createCashEntryAction, type CashEntryState } from '@/lib/cash/actions';
import { todayIso } from '@/lib/validation';

const INITIAL: CashEntryState = { ok: false };

// Ручная операция кассы (приход/расход), не привязанная к делу. accountId — счёт
// активной вкладки (предвыбран); пользователь может сменить.
export function CashEntryForm({
  accounts,
  accountId,
}: {
  accounts: CashAccount[];
  accountId: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<CashEntryState, FormData>(
    createCashEntryAction,
    INITIAL,
  );
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const active = accounts.filter((a) => a.is_active);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Field label={t.cash.entry.account} htmlFor={fid('acc')} error={state.fieldErrors?.account_id} required>
          <Select name="account_id" defaultValue={accountId}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.cash.entry.direction} htmlFor={fid('dir')} error={state.fieldErrors?.direction} required>
          <Select name="direction" defaultValue="out">
            <option value="in">{t.enums.cashDirection.in}</option>
            <option value="out">{t.enums.cashDirection.out}</option>
          </Select>
        </Field>

        <Field label={t.cash.entry.amount} htmlFor={fid('amt')} error={state.fieldErrors?.amount} required>
          <Input
            id={fid('amt')}
            name="amount"
            type="text"
            inputMode="decimal"
            maxLength={16}
            required
            placeholder={t.cash.entry.amountPlaceholder}
            className="tabular-nums"
          />
        </Field>

        <Field label={t.cash.entry.date} htmlFor={fid('date')} error={state.fieldErrors?.entry_date} required>
          <Input id={fid('date')} name="entry_date" type="date" required defaultValue={todayIso()} />
        </Field>
      </div>

      <Field label={t.cash.entry.description} htmlFor={fid('desc')} error={state.fieldErrors?.description} required>
        <Textarea
          id={fid('desc')}
          name="description"
          rows={2}
          maxLength={300}
          required
          placeholder={t.cash.entry.descriptionPlaceholder}
        />
      </Field>

      {state.message && !state.ok && (
        <p role="alert" className="text-[12px] text-error">{state.message}</p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          <Plus size={14} strokeWidth={2} />
          {pending ? t.cash.entry.submitting : t.cash.entry.submit}
        </Button>
      </div>
    </form>
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
      {error && <p className="text-[12px] text-error" role="alert">{error}</p>}
    </div>
  );
}
