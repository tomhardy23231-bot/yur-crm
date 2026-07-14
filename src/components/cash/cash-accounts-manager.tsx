'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { Plus, Pencil, Banknote, CreditCard, Landmark } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { cn, formatMoney } from '@/lib/utils';
import { CASH_ACCOUNT_KINDS, type CashAccount } from '@/lib/types/db';
import {
  createCashAccountAction,
  updateCashAccountAction,
  type CashAccountState,
} from '@/lib/cash/actions';
import { todayIso } from '@/lib/validation';

const INITIAL: CashAccountState = { ok: false };

// Иконка и цвет акцент-полосы по виду счёта (каркас cash-page AccountCard).
const KIND_ICONS = {
  bank: Landmark,
  cash: Banknote,
  card: CreditCard,
} as const;

const KIND_BAR = {
  bank: 'bg-primary',
  cash: 'bg-success',
  card: 'bg-warning',
} as const;

// Управление счетами кассы (видно только обладателю can_manage_cash — страница
// уже под requireCap). Витрина счетов-плиток + форма добавления + правка.
export function CashAccountsManager({
  accounts,
  balances = {},
}: {
  accounts: CashAccount[];
  /** Текущий остаток по счёту (accountId → closingNow, посчитан на странице). */
  balances?: Record<string, number>;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-text">{t.cash.accounts.heading}</h2>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((acc) => {
          if (editingId === acc.id) {
            return (
              <div key={acc.id} className="sm:col-span-2 xl:col-span-3">
                <AccountForm
                  account={acc}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            );
          }
          const KindIcon = KIND_ICONS[acc.kind];
          return (
            <div
              key={acc.id}
              className="group relative overflow-hidden rounded-card border border-border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-border hover:shadow-lg"
            >
              {/* Акцент-полоса цветом вида счёта */}
              <div className={cn('h-1 w-full', KIND_BAR[acc.kind])} aria-hidden="true" />
              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken text-text-muted">
                    <KindIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-chip bg-surface-sunken px-2 py-0.5 text-[10.5px] font-semibold text-text-muted">
                      <KindIcon size={11} strokeWidth={2} aria-hidden="true" />
                      {t.enums.cashAccountKind[acc.kind]}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setEditingId(acc.id); setAdding(false); }}
                      aria-label={t.cash.accounts.edit}
                      title={t.cash.accounts.edit}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-primary-softer hover:text-primary-pressed"
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-[13px] font-medium text-text-muted">{acc.name}</p>
                  <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-tight text-text tabular-nums">
                    {formatMoney(balances[acc.id] ?? acc.opening_balance)}{' '}
                    <span className="text-[11px] font-medium text-text-subtle">₴</span>
                  </p>
                </div>

                <p className="text-[11px] text-text-subtle">
                  {t.cash.accounts.openingBalance}: {formatMoney(acc.opening_balance)} ₴ (
                  {acc.opening_date})
                  {acc.is_default && <> · {t.cash.accounts.defaultBadge}</>}
                  {!acc.is_active && <> · {t.cash.accounts.inactiveBadge}</>}
                </p>
              </div>
            </div>
          );
        })}

        {adding && (
          <div className="sm:col-span-2 xl:col-span-3">
            <AccountForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        )}
      </div>
    </section>
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
