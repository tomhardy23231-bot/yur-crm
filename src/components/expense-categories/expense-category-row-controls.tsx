'use client';

import { useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Pencil, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { ExpenseScope } from '@/lib/expenses/categories';
import {
  deleteExpenseCategoryAction,
  renameExpenseCategoryAction,
  setExpenseCategoryActiveAction,
  setExpenseCategoryScopeAction,
} from '@/lib/expenses/category-actions';

// Inline-переименование статьи расхода. Встроенные (is_builtin) переименовать
// нельзя — их лейбл берётся из словаря. Права держит RLS/экшен
// (cap manage_expense_categories); страница за requireCap.
export function ExpenseCategoryNameControl({
  id,
  name,
  isBuiltin,
}: {
  id: string;
  name: string;
  isBuiltin: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (isBuiltin) {
    return <span className="text-[14px] font-medium text-text">{name}</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[14px] font-medium text-text">{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t.expenseCategories.rename.title}
          className="text-text-subtle transition-colors hover:text-text"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </span>
    );
  }

  return (
    <form
      ref={formRef}
      action={renameExpenseCategoryAction}
      onSubmit={() => setEditing(false)}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        type="text"
        maxLength={60}
        defaultValue={name}
        aria-label={t.expenseCategories.rename.ariaLabel}
        autoFocus
        className="h-8 w-[200px]"
      />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        aria-label={t.expenseCategories.rename.save}
      >
        <Check size={14} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setEditing(false)}
        aria-label={t.common.cancel}
      >
        <X size={14} strokeWidth={2} />
      </Button>
    </form>
  );
}

// Кнопка скрыть/вернуть статью (is_active).
export function ExpenseCategoryActiveControl({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  return (
    <form action={setExpenseCategoryActiveAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={isActive ? 'false' : 'true'} />
      <ActiveSubmit isActive={isActive} />
    </form>
  );
}

function ActiveSubmit({ isActive }: { isActive: boolean }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={isActive ? 'ghost' : 'secondary'}
      size="sm"
      disabled={pending}
    >
      {isActive ? t.expenseCategories.deactivate : t.expenseCategories.activate}
    </Button>
  );
}

// ── Область применения статьи (0013) ─────────────────────────────────────────
// Сегмент-контрол «В делах / По фирме / Везде»: определяет, в какой форме
// расхода статья предлагается. На уже внесённые расходы не влияет.
export function ExpenseCategoryScopeControl({
  id,
  scope,
}: {
  id: string;
  scope: ExpenseScope;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const s = t.expenseCategories.scope;

  const OPTIONS: ReadonlyArray<{ value: ExpenseScope; label: string; hint: string }> = [
    { value: 'case', label: s.case, hint: s.caseHint },
    { value: 'company', label: s.company, hint: s.companyHint },
    { value: 'both', label: s.both, hint: s.bothHint },
  ];

  const set = (next: ExpenseScope) => {
    if (next === scope || pending) return;
    const fd = new FormData();
    fd.set('id', id);
    fd.set('scope', next);
    startTransition(async () => {
      await setExpenseCategoryScopeAction(fd);
    });
  };

  return (
    <div
      role="group"
      aria-label={s.label}
      className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => set(o.value)}
          disabled={pending}
          title={o.hint}
          aria-pressed={scope === o.value}
          className={cn(
            'inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-60',
            scope === o.value
              ? 'bg-primary-subtle text-primary-pressed'
              : 'text-text-subtle hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Удаление своей статьи ────────────────────────────────────────────────────
// Встроенные не удаляются (только скрываются); своя — пока по ней нет расходов.
export function ExpenseCategoryDeleteControl({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setOpen(false);
    startTransition(async () => {
      const res = await deleteExpenseCategoryAction(id);
      if (res.ok) toast.success(res.message ?? t.expenseCategories.deleted);
      else toast.error(res.message ?? t.errors.db.generic);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-label={t.expenseCategories.delete}
        title={t.expenseCategories.delete}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-error-bg hover:text-error disabled:opacity-50"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
      <ConfirmDialog
        open={open}
        title={t.expenseCategories.delete}
        description={fmt(t.expenseCategories.deleteConfirm, { name })}
        confirmLabel={t.expenseCategories.delete}
        tone="danger"
        pending={pending}
        onConfirm={run}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
