'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Gift, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import {
  createBonusAction,
  createPayoutAction,
  deletePayrollTransactionAction,
  type PayrollMutationState,
} from '@/lib/payroll/actions';
import { type RoleInCase } from '@/lib/types/db';

const PAYROLL_INITIAL: PayrollMutationState = { ok: false };

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export type PayoutBucket = {
  case_id: string;
  number_title: string;
  role_in_case: RoleInCase;
  outstanding: number;
};

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Кнопки + переключение модалок ──────────────────────────────────────────
export function PayrollActions({
  userId,
  userName,
  buckets,
  bonusOutstanding,
}: {
  userId: string;
  userName: string;
  buckets: PayoutBucket[];
  bonusOutstanding: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | 'payout' | 'bonus'>(null);

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setOpen('bonus')}>
        <Gift size={14} strokeWidth={1.75} />
        {t.payroll.actions.bonusButton}
      </Button>
      <Button size="sm" onClick={() => setOpen('payout')}>
        <Coins size={14} strokeWidth={1.75} />
        {t.payroll.actions.payoutButton}
      </Button>

      {open === 'payout' && (
        <PayoutModal
          userId={userId}
          userName={userName}
          buckets={buckets}
          bonusOutstanding={bonusOutstanding}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'bonus' && (
        <BonusModal
          userId={userId}
          userName={userName}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ── Удаление движения (выплаты/премии) с подтверждением ─────────────────────
export function DeleteTransactionButton({
  transactionId,
  label,
}: {
  transactionId: string;
  label: string;
}) {
  const { t, fmt } = useI18n();
  return (
    <form
      action={deletePayrollTransactionAction}
      onSubmit={(e) => {
        if (!window.confirm(fmt(t.payroll.actions.deleteConfirm, { label }))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="transaction_id" value={transactionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-label={t.payroll.actions.deleteAria}
        className="text-text-muted hover:text-error"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </Button>
    </form>
  );
}

// ── Оболочка модалки (портал + подложка) ────────────────────────────────────
function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={t.payroll.actions.closeAria}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#080A0F]/70 backdrop-blur-[3px]"
      />
      <div className="relative z-10 flex w-[min(560px,95vw)] max-h-[90vh] flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-[17px] font-bold text-text">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] text-text-muted">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.payroll.actions.closeAria}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Модалка выплаты (галочки по делам) ──────────────────────────────────────
function PayoutModal({
  userId,
  userName,
  buckets,
  bonusOutstanding,
  onClose,
}: {
  userId: string;
  userName: string;
  buckets: PayoutBucket[];
  bonusOutstanding: number;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(
    createPayoutAction,
    PAYROLL_INITIAL,
  );
  // Выбранные дела — ключ `${case_id}:${role}`.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const hasBonus = bonusOutstanding > 0;
  const [bonusChecked, setBonusChecked] = useState(false);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const keyOf = (b: PayoutBucket) => `${b.case_id}:${b.role_in_case}`;

  const total = useMemo(
    () =>
      buckets
        .filter((b) => checked.has(keyOf(b)))
        .reduce((s, b) => s + b.outstanding, 0) +
      (bonusChecked ? bonusOutstanding : 0),
    [buckets, checked, bonusChecked, bonusOutstanding],
  );

  function toggle(b: PayoutBucket) {
    setChecked((prev) => {
      const next = new Set(prev);
      const k = keyOf(b);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const allKeys = buckets.map(keyOf);
  const allSelected = checked.size === buckets.length && buckets.length > 0;
  const nothingToPay = buckets.length === 0 && !hasBonus;

  function submit(formData: FormData) {
    const allocations = buckets
      .filter((b) => checked.has(keyOf(b)))
      .map((b) => ({ case_id: b.case_id, role_in_case: b.role_in_case }));
    formData.set('user_id', userId);
    formData.set('allocations', JSON.stringify(allocations));
    formData.set('bonus_amount', bonusChecked ? String(bonusOutstanding) : '0');
    return formAction(formData);
  }

  return (
    <ModalShell
      title={t.payroll.actions.payoutTitle}
      subtitle={fmt(t.payroll.actions.payoutSubtitle, { name: userName })}
      onClose={onClose}
    >
      <form action={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {nothingToPay ? (
            <p className="py-8 text-center text-[13px] text-text-muted">
              {t.payroll.actions.nothingToPay}
            </p>
          ) : (
            <>
              {buckets.length > 0 && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] uppercase tracking-[0.04em] text-text-muted">
                      {t.payroll.actions.casesToPay}
                    </span>
                    <button
                      type="button"
                      className="text-[12.5px] font-medium text-primary hover:underline"
                      onClick={() =>
                        setChecked(allSelected ? new Set() : new Set(allKeys))
                      }
                    >
                      {allSelected ? t.payroll.actions.unselectAll : t.payroll.actions.selectAll}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {buckets.map((b) => {
                      const k = keyOf(b);
                      const on = checked.has(k);
                      return (
                        <li key={k}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                              on
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-surface hover:bg-surface-muted',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(b)}
                              className="h-4 w-4 accent-[var(--color-primary)]"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block truncate text-[13px] font-medium text-text">
                                {b.number_title}
                              </span>
                              <span className="text-[12px] text-text-muted">
                                {t.enums.roleInCase[b.role_in_case]}
                              </span>
                            </span>
                            <span className="tabular-nums text-[13px] font-semibold text-success whitespace-nowrap">
                              {MONEY.format(b.outstanding)} ₴
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {hasBonus && (
                <>
                  <div className="mb-2 mt-4 text-[12px] uppercase tracking-[0.04em] text-text-muted">
                    {t.payroll.actions.bonusesHeading}
                  </div>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      bonusChecked
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-surface hover:bg-surface-muted',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={bonusChecked}
                      onChange={() => setBonusChecked((v) => !v)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-text">
                        {t.payroll.actions.unpaidBonuses}
                      </span>
                      <span className="text-[12px] text-text-muted">
                        {t.payroll.actions.bonusesAside}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-warning">
                      {MONEY.format(bonusOutstanding)} ₴
                    </span>
                  </label>
                </>
              )}
            </>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="payout-date"
                className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
              >
                {t.payroll.actions.payoutDate}
              </Label>
              <Input
                id="payout-date"
                name="occurred_on"
                type="date"
                defaultValue={todayISO()}
                required
                className=""
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <Label
              htmlFor="payout-comment"
              className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
            >
              {t.payroll.actions.comment}
            </Label>
            <Textarea
              id="payout-comment"
              name="comment"
              maxLength={500}
              rows={2}
              placeholder={t.payroll.actions.payoutCommentPlaceholder}
            />
          </div>

          {state.message && !state.ok && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
            >
              {state.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-6 py-4">
          <span className="text-[13px] text-text-muted">
            {t.payroll.actions.toPay}{' '}
            <span className="tabular-nums text-[15px] font-bold text-text">
              {MONEY.format(total)} ₴
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t.payroll.actions.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={isPending || total <= 0}>
              {isPending ? t.payroll.actions.saving : t.payroll.actions.savePayout}
            </Button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Модалка премии ──────────────────────────────────────────────────────────
function BonusModal({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(
    createBonusAction,
    PAYROLL_INITIAL,
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  function submit(formData: FormData) {
    formData.set('user_id', userId);
    return formAction(formData);
  }

  return (
    <ModalShell
      title={t.payroll.actions.bonusTitle}
      subtitle={fmt(t.payroll.actions.bonusSubtitle, { name: userName })}
      onClose={onClose}
    >
      <form action={submit} className="flex flex-col">
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="bonus-amount"
                className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
              >
                {t.payroll.actions.amount}<span className="ml-0.5 text-error">*</span>
              </Label>
              <Input
                id="bonus-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                required
                maxLength={16}
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
                  if (cleaned !== e.currentTarget.value) {
                    e.currentTarget.value = cleaned;
                  }
                }}
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="bonus-date"
                className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
              >
                {t.payroll.actions.date}
              </Label>
              <Input
                id="bonus-date"
                name="occurred_on"
                type="date"
                defaultValue={todayISO()}
                className=""
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="bonus-comment"
              className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
            >
              {t.payroll.actions.comment}
            </Label>
            <Textarea
              id="bonus-comment"
              name="comment"
              maxLength={500}
              rows={2}
              placeholder={t.payroll.actions.bonusCommentPlaceholder}
            />
          </div>

          {state.message && !state.ok && (
            <p
              role="alert"
              className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
            >
              {state.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-muted/50 px-6 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t.payroll.actions.cancel}
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? t.payroll.actions.saving : t.payroll.actions.saveBonus}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
