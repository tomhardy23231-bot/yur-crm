'use client';

import { useActionState, useCallback, useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import { updateCashEntryAction, type CashEntryState } from '@/lib/cash/actions';
import type { CashAccount, CashEntryWithCase } from '@/lib/types/db';
import { workDateBounds } from '@/lib/validation';

const INITIAL: CashEntryState = { ok: false };

// Правка РУЧНОЙ операции кассы (2026-08-04). Авто-строки (приход платежа,
// розхід расхода) сюда не попадают: они правятся через свою сущность, и RLS
// на UPDATE их не отдаёт.
export function CashEntryEditForm({
  entry,
  accounts,
  onSuccess,
  onCancel,
}: {
  entry: CashEntryWithCase;
  accounts: ReadonlyArray<Pick<CashAccount, 'id' | 'name' | 'is_active'>>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;

  const [state, formAction, pending] = useActionState<CashEntryState, FormData>(
    updateCashEntryAction,
    INITIAL,
  );
  const handledRef = useRef<CashEntryState | null>(null);
  const done = useCallback(() => onSuccess?.(), [onSuccess]);

  useEffect(() => {
    if (!state.ok || handledRef.current === state) return;
    handledRef.current = state;
    toast.success(t.cash.actions.entryUpdated);
    done();
  }, [state, toast, t, done]);

  // Неактивный счёт остаётся в списке, если операция уже на нём: иначе правка
  // описания молча перенесла бы деньги на другой счёт.
  const options = accounts.filter((a) => a.is_active || a.id === entry.account_id);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={entry.id} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.cash.entry.account} htmlFor={fid('acc')} error={state.fieldErrors?.account_id} required>
          <Select id={fid('acc')} name="account_id" defaultValue={entry.account_id} required>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.cash.entry.direction} htmlFor={fid('dir')} error={state.fieldErrors?.direction} required>
          <Select id={fid('dir')} name="direction" defaultValue={entry.direction} required>
            <option value="in">{t.enums.cashDirection.in}</option>
            <option value="out">{t.enums.cashDirection.out}</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.cash.entry.amount} htmlFor={fid('amt')} error={state.fieldErrors?.amount} required>
          <Input
            id={fid('amt')}
            name="amount"
            type="text"
            inputMode="decimal"
            maxLength={16}
            required
            defaultValue={String(entry.amount)}
            className="tabular-nums"
            onChange={(e) => {
              const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
              if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
            }}
          />
        </Field>

        <Field label={t.cash.entry.date} htmlFor={fid('date')} error={state.fieldErrors?.entry_date} required>
          <Input
            id={fid('date')}
            name="entry_date"
            type="date"
            {...workDateBounds()}
            required
            defaultValue={entry.entry_date}
          />
        </Field>
      </div>

      <Field label={t.cash.entry.description} htmlFor={fid('desc')} error={state.fieldErrors?.description} required>
        <Textarea
          id={fid('desc')}
          name="description"
          rows={2}
          maxLength={300}
          required
          defaultValue={entry.description}
        />
      </Field>

      {state.message && !state.ok && (
        <p role="alert" className="text-[12px] text-error">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t.cash.entry.submitting : t.cash.entry.saveEdit}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
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
      <Label htmlFor={htmlFor} className="text-[12px] text-text-muted">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
