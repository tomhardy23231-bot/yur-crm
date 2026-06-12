'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { Plus, Pencil, Star, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import { CASH_ACCOUNT_KINDS, type CashAccount } from '@/lib/types/db';
import {
  createCashAccountAction,
  updateCashAccountAction,
  type CashAccountState,
} from '@/lib/cash/actions';
import { todayIso } from '@/lib/validation';

const INITIAL: CashAccountState = { ok: false };

// Управление счетами кассы (видно только обладателю can_manage_cash — страница
// уже под requireCap). Список счетов + форма добавления + правка существующего.
export function CashAccountsManager({ accounts }: { accounts: CashAccount[] }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[14px] font-semibold text-text">
          <Wallet size={16} strokeWidth={1.75} className="text-text-muted" />
          {t.cash.accounts.heading}
        </h2>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus size={14} strokeWidth={2} />
            {t.cash.accounts.add}
          </Button>
        )}
      </div>

      {accounts.length === 0 && !adding && (
        <p className="text-[13px] text-text-muted">{t.cash.report.noAccounts}</p>
      )}

      <div className="flex flex-col gap-2">
        {accounts.map((acc) =>
          editingId === acc.id ? (
            <AccountForm
              key={acc.id}
              account={acc}
              onDone={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={acc.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
            >
              <span className="text-[13.5px] font-semibold text-text">{acc.name}</span>
              <Badge tone="neutral" quiet>
                {t.enums.cashAccountKind[acc.kind]}
              </Badge>
              {acc.is_default && (
                <Badge tone="info" quiet>
                  <Star size={11} strokeWidth={2} className="shrink-0" />
                  {t.cash.accounts.defaultBadge}
                </Badge>
              )}
              {!acc.is_active && (
                <Badge tone="warning" quiet>
                  {t.cash.accounts.inactiveBadge}
                </Badge>
              )}
              <span className="ml-auto tabular-nums text-[12.5px] text-text-muted">
                {t.cash.accounts.openingBalance}:{' '}
                <span className="font-semibold text-text">{formatMoney(acc.opening_balance)} ₴</span>
                <span className="text-text-subtle"> ({acc.opening_date})</span>
              </span>
              <button
                type="button"
                onClick={() => { setEditingId(acc.id); setAdding(false); }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <Pencil size={13} strokeWidth={1.75} />
                {t.cash.accounts.edit}
              </button>
            </div>
          ),
        )}

        {adding && (
          <AccountForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        )}
      </div>
    </Card>
  );
}

function AccountForm({
  account,
  onDone,
  onCancel,
}: {
  account?: CashAccount;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const isEdit = Boolean(account);
  const action = isEdit ? updateCashAccountAction : createCashAccountAction;
  const [state, formAction, pending] = useActionState<CashAccountState, FormData>(action, INITIAL);
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-primary-border bg-primary-subtle/30 p-3"
    >
      {isEdit && <input type="hidden" name="id" value={account!.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.cash.accounts.name} htmlFor={fid('name')} error={state.fieldErrors?.name} required>
          <Input
            id={fid('name')}
            name="name"
            type="text"
            maxLength={120}
            required
            defaultValue={account?.name ?? ''}
            placeholder={t.cash.accounts.namePlaceholder}
          />
        </Field>

        <Field label={t.cash.accounts.kind} htmlFor={fid('kind')} error={state.fieldErrors?.kind}>
          {isEdit ? (
            // Вид счёта после создания не меняем (он завязан на маппинг автоприхода).
            <div className="flex h-10 items-center px-1 text-[13.5px] text-text-muted">
              {t.enums.cashAccountKind[account!.kind]}
            </div>
          ) : (
            <Select name="kind" defaultValue="bank">
              {CASH_ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t.enums.cashAccountKind[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={t.cash.accounts.openingBalance}
          htmlFor={fid('ob')}
          error={state.fieldErrors?.opening_balance}
        >
          <Input
            id={fid('ob')}
            name="opening_balance"
            type="text"
            inputMode="decimal"
            maxLength={16}
            defaultValue={account ? String(account.opening_balance) : '0'}
            className="tabular-nums"
          />
        </Field>

        <Field
          label={t.cash.accounts.openingDate}
          htmlFor={fid('od')}
          error={state.fieldErrors?.opening_date}
          required
        >
          <Input
            id={fid('od')}
            name="opening_date"
            type="date"
            required
            defaultValue={account?.opening_date ?? todayIso()}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[13px] text-text">
          <input
            type="checkbox"
            name="is_default"
            defaultChecked={account?.is_default ?? false}
            className="h-4 w-4 rounded border-border-strong text-primary accent-[var(--primary)]"
          />
          {t.cash.accounts.isDefault}
        </label>
        {isEdit && (
          <label className="inline-flex items-center gap-2 text-[13px] text-text">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={account?.is_active ?? true}
              className="h-4 w-4 rounded border-border-strong text-primary accent-[var(--primary)]"
            />
            {t.cash.accounts.isActive}
          </label>
        )}
      </div>
      <p className="-mt-1 text-[12px] text-text-subtle">{t.cash.accounts.isDefaultHint}</p>

      {state.message && !state.ok && (
        <p role="alert" className="text-[12px] text-error">{state.message}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t.cash.accounts.saving : t.cash.accounts.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t.cash.accounts.cancel}
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
      <Label htmlFor={htmlFor} className="text-[12px] text-text-muted">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </Label>
      {children}
      {error && <p className="text-[12px] text-error" role="alert">{error}</p>}
    </div>
  );
}
