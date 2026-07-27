'use client';

import { useActionState, useId, useRef, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  createExpenseAction,
  type CreateExpenseFields,
  type CreateExpenseState,
} from '@/lib/expenses/actions';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import { createExpenseCategoryAction } from '@/lib/expenses/category-actions';
import {
  EXPENSE_METHODS,
  isExpenseMethod,
  type CashAccount,
  type ExpenseMethod,
} from '@/lib/types/db';
import { parseAmount, todayIso } from '@/lib/validation';

import type { OptimisticExpenseInput } from './expenses-list';

const INITIAL: CreateExpenseState = { ok: false };

interface Props {
  /** Дело, к которому относится трата. Не задано — расход фирмы (0010). */
  caseId?: string;
  categories: ExpenseCategoryOption[];
  /**
   * Счета кассы для выбора «с чего списано» (0015). Переданы — выбирается
   * КОНКРЕТНЫЙ счёт (карт может быть несколько); не переданы (у вносящего нет
   * доступа к кассе) — остаётся выбор ВИДА счёта.
   */
  accounts?: CashAccount[];
  /** Может ли пользователь заводить статьи «на лету» (manage_expense_categories). */
  canAddCategory?: boolean;
  /** Вызывается после успешного сохранения (напр. закрыть модалку). */
  onSuccess?: () => void;
  /** Оптимистичное добавление строки расхода в список (из ExpensesList). */
  addOptimistic?: (input: OptimisticExpenseInput) => void;
}

// Форма расхода — зеркало PaymentForm, с двумя отличиями:
//  • статья расхода выбирается из справочника (id, не свободный текст);
//  • «списать со счёта» — закрытый код card|bank|cash: от него зависит, на какой
//    счёт кассы ляжет авто-Розхід (private.cash_kind_for_method).
export function ExpenseForm({
  caseId,
  categories,
  accounts,
  canAddCategory = false,
  onSuccess,
  addOptimistic,
}: Props) {
  const { t } = useI18n();
  // Статьи, заведённые прямо из этой формы, живут локально до перезагрузки —
  // чтобы новую можно было сразу выбрать.
  const [extraCats, setExtraCats] = useState<ExpenseCategoryOption[]>([]);
  const allCats = [...categories, ...extraCats];
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const activeAccounts = (accounts ?? []).filter((a) => a.is_active);
  const toast = useToast();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const [state, formAction, isPending] = useActionState<CreateExpenseState, FormData>(
    async (prev, formData) => {
      // Оптимистичная строка — внутри action (= внутри transition).
      if (addOptimistic) {
        const amount = parseAmount(String(formData.get('amount') ?? ''));
        const spentAt = String(formData.get('spent_at') ?? '').trim();
        const method = String(formData.get('method') ?? '').trim();
        const categoryId = String(formData.get('category_id') ?? '').trim();
        if (amount !== null && spentAt && isExpenseMethod(method)) {
          addOptimistic({
            id: crypto.randomUUID(),
            amount,
            spent_at: spentAt,
            method,
            note: String(formData.get('note') ?? '').trim() || null,
            categoryLabel:
              categories.find((c) => c.id === categoryId)?.label ?? '',
          });
        }
      }
      return createExpenseAction(prev, formData);
    },
    INITIAL,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [amountError, setAmountError] = useState<string | undefined>();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success(t.expenses.form.saved);
      onSuccess?.();
    }
  }, [state.ok, onSuccess, toast, t.expenses.form.saved]);

  useShakeInvalidFields(formRef, state);

  function submitGuarded(formData: FormData) {
    // Клиентская валидация суммы — зеркало серверного parseAmount.
    const amountRaw = String(formData.get('amount') ?? '');
    if (parseAmount(amountRaw) === null) {
      setAmountError(t.expenses.errors.amountInvalid);
      return;
    }
    setAmountError(undefined);
    return formAction(formData);
  }

  function err(field: CreateExpenseFields): string | undefined {
    if (field === 'amount') return state.fieldErrors?.amount ?? amountError;
    return state.fieldErrors?.[field];
  }

  // Статей нет — подсказываем, где их завести (форма без статьи бессмысленна).
  if (categories.length === 0) {
    return (
      <p className="text-[13px] text-text-subtle">{t.expenses.form.noCategories}</p>
    );
  }

  return (
    <form ref={formRef} action={submitGuarded} className="flex flex-col gap-3">
      {/* Пусто = расход фирмы: серверный экшен трактует это как case_id NULL. */}
      <input type="hidden" name="case_id" value={caseId ?? ''} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
        <Field
          label={t.expenses.form.amountLabel}
          htmlFor={fid('amount')}
          error={err('amount')}
          required
        >
          <Input
            id={fid('amount')}
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder={t.expenses.form.amountPlaceholder}
            required
            maxLength={16}
            onChange={(e) => {
              const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
              if (cleaned !== e.currentTarget.value) {
                e.currentTarget.value = cleaned;
              }
              if (amountError) setAmountError(undefined);
            }}
            aria-invalid={err('amount') ? 'true' : undefined}
            className="tabular-nums"
          />
        </Field>

        <Field
          label={t.expenses.form.spentAtLabel}
          htmlFor={fid('spent-at')}
          error={err('spent_at')}
          required
        >
          <Input
            id={fid('spent-at')}
            name="spent_at"
            type="date"
            defaultValue={todayIso()}
            required
            aria-invalid={err('spent_at') ? 'true' : undefined}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
        <Field
          label={t.expenses.form.categoryLabel}
          htmlFor={fid('category')}
          error={err('category_id')}
          required
          action={
            canAddCategory ? (
              <QuickAddCategory
                scope={caseId ? 'case' : 'company'}
                onCreated={(opt) => {
                  setExtraCats((prev) => [...prev, opt]);
                  setCategoryId(opt.id);
                }}
              />
            ) : undefined
          }
        >
          <Select
            id={fid('category')}
            name="category_id"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            aria-invalid={err('category_id') ? 'true' : undefined}
          >
            {allCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t.expenses.form.methodLabel}
          htmlFor={fid('method')}
          error={err('method')}
          required
        >
          {activeAccounts.length > 0 ? (
            // Конкретный счёт: «Моно», «ПриватБанк», «Каса» — как их назвали.
            <Select
              id={fid('method')}
              name="account_id"
              defaultValue={activeAccounts[0]!.id}
              required
              aria-invalid={err('method') ? 'true' : undefined}
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              id={fid('method')}
              name="method"
              defaultValue={'cash' satisfies ExpenseMethod}
              required
              aria-invalid={err('method') ? 'true' : undefined}
            >
              {EXPENSE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t.enums.expenseMethod[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        label={t.expenses.form.noteLabel}
        htmlFor={fid('note')}
        error={err('note')}
      >
        <Textarea
          id={fid('note')}
          name="note"
          maxLength={500}
          rows={2}
          placeholder={t.expenses.form.notePlaceholder}
          aria-invalid={err('note') ? 'true' : undefined}
        />
      </Field>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-control border border-error/15 bg-error-bg px-3 py-2 text-sm text-error-text"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? t.expenses.form.submitting : t.expenses.form.submit}
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
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  /** Кнопка справа от подписи (напр. «Новая статья»). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[12px] text-text-muted">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </Label>
        {action}
      </div>
      {children}
      {error && (
        <p className="animate-field-error text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Быстрое создание статьи прямо из формы расхода (2026-07-26, просьба
// владельца). Заводится в тот же скоуп, что и форма: из дела — «в делах»,
// из кассы — «по фирме».
function QuickAddCategory({
  scope,
  onCreated,
}: {
  scope: 'case' | 'company';
  onCreated: (opt: ExpenseCategoryOption) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(undefined);
    const fd = new FormData();
    fd.set('name', trimmed);
    fd.set('scope', scope);
    const res = await createExpenseCategoryAction({ ok: false }, fd);
    setBusy(false);
    if (!res.ok || !res.created) {
      setError(res.fieldError ?? res.message);
      return;
    }
    onCreated({ id: res.created.id, code: res.created.code, label: res.created.name });
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-pressed transition-colors hover:underline"
      >
        <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
        {t.expenseCategories.quickAdd.trigger}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.expenseCategories.quickAdd.placeholder}
        maxLength={60}
        aria-label={t.expenseCategories.quickAdd.placeholder}
        className="h-7 w-40 text-[12px]"
        onKeyDown={(e) => {
          // Enter внутри формы расхода отправил бы её — гасим и создаём статью.
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="text-[12px] font-medium text-primary-pressed hover:underline disabled:opacity-50"
      >
        {t.expenseCategories.quickAdd.save}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(undefined);
        }}
        className="text-[12px] text-text-muted hover:underline"
      >
        {t.expenseCategories.quickAdd.cancel}
      </button>
      {error && <span className="text-[11px] text-error">{error}</span>}
    </span>
  );
}
