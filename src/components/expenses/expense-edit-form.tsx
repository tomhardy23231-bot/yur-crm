'use client';

import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import {
  updateExpenseAction,
  type UpdateExpenseFields,
  type UpdateExpenseState,
} from '@/lib/expenses/actions';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import {
  EXPENSE_METHODS,
  type ExpenseMethod,
  type ExpenseWithRefs,
} from '@/lib/types/db';
import { parseAmount, workDateBounds } from '@/lib/validation';

const INITIAL: UpdateExpenseState = { ok: false };

// Правка расхода (0019, жалоба клиента 2026-08-04: «нельзя изменить статью и
// комментарий»). Зеркало ExpenseForm, но БЕЗ выбора дела: перенос расхода
// между делом и фирмой — смена зоны видимости, её держит БД-гард. Строка
// кассы пересоберётся триггером.
export function ExpenseEditForm({
  expense,
  categories,
  accounts,
  onSuccess,
  onCancel,
}: {
  expense: ExpenseWithRefs;
  categories: ExpenseCategoryOption[];
  /** Счета кассы: выбор КОНКРЕТНОГО счёта списания. Пусто — выбор вида счёта. */
  accounts?: ReadonlyArray<{ id: string; name: string; is_active?: boolean }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;

  const [state, formAction, pending] = useActionState<UpdateExpenseState, FormData>(
    updateExpenseAction,
    INITIAL,
  );
  const handledRef = useRef<UpdateExpenseState | null>(null);
  const done = useCallback(() => onSuccess?.(), [onSuccess]);

  useEffect(() => {
    if (!state.ok || handledRef.current === state) return;
    handledRef.current = state;
    toast.success(t.expenses.row.updated);
    done();
  }, [state, toast, t, done]);

  // Статья расхода могла с тех пор уехать в архив: подставляем её в список,
  // иначе селект молча показал бы чужую статью и правка комментария сменила
  // бы её заодно.
  const hasCurrent = categories.some((c) => c.id === expense.category_id);
  const options = hasCurrent
    ? categories
    : [
        { id: expense.category_id, code: expense.category.code, label: expense.category.label },
        ...categories,
      ];
  const [categoryId, setCategoryId] = useState(expense.category_id);

  // Счёт списания — самое опасное поле этой формы: она открывается ради правки
  // комментария, а селект молча решает, откуда ушли деньги. Две ловушки, обе
  // тихие (ревью 0019):
  //   • у расходов до 0015 конкретного счёта НЕТ (хранился только вид счёта,
  //     method) — селект показал бы первый счёт и сохранение переложило бы
  //     расход на него. Поэтому для таких строк первой опцией идёт «оставить
  //     как есть», и она сохраняет прежний method;
  //   • счёт расхода мог уехать в неактивные, а списки счетов для форм отдают
  //     только активные — тогда его вообще нет среди опций, и браузер выберет
  //     первую. Поэтому текущий счёт подставляем в список, если его там нет
  //     (та же защита, что и у статьи расхода выше).
  const KEEP_METHOD = '';
  const supplied = (accounts ?? []).filter(
    (a) => a.is_active !== false || a.id === expense.account_id,
  );
  const activeAccounts =
    expense.account_id && !supplied.some((a) => a.id === expense.account_id)
      ? [{ id: expense.account_id, name: t.expenses.form.accountKept }, ...supplied]
      : supplied;
  const [amountError, setAmountError] = useState<string | undefined>();

  const err = (f: UpdateExpenseFields): string | undefined => {
    if (f === 'amount') return state.fieldErrors?.amount ?? amountError;
    return state.fieldErrors?.[f];
  };

  function submitGuarded(formData: FormData) {
    if (parseAmount(String(formData.get('amount') ?? '')) === null) {
      setAmountError(t.expenses.errors.amountInvalid);
      return;
    }
    setAmountError(undefined);
    return formAction(formData);
  }

  return (
    <form action={submitGuarded} className="flex flex-col gap-3">
      <input type="hidden" name="expense_id" value={expense.id} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.expenses.form.amountLabel} htmlFor={fid('amount')} error={err('amount')} required>
          <Input
            id={fid('amount')}
            name="amount"
            type="text"
            inputMode="decimal"
            maxLength={16}
            required
            defaultValue={String(expense.amount)}
            className="tabular-nums"
            onChange={(e) => {
              const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, '');
              if (cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
              if (amountError) setAmountError(undefined);
            }}
            aria-invalid={err('amount') ? 'true' : undefined}
          />
        </Field>

        <Field label={t.expenses.form.spentAtLabel} htmlFor={fid('spent')} error={err('spent_at')} required>
          <Input
            id={fid('spent')}
            name="spent_at"
            type="date"
            {...workDateBounds()}
            required
            defaultValue={expense.spent_at}
            aria-invalid={err('spent_at') ? 'true' : undefined}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.expenses.form.categoryLabel} htmlFor={fid('cat')} error={err('category_id')} required>
          <Select
            id={fid('cat')}
            name="category_id"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            aria-invalid={err('category_id') ? 'true' : undefined}
          >
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.expenses.form.methodLabel} htmlFor={fid('acc')} error={err('method')} required>
          {activeAccounts.length > 0 ? (
            <>
              <Select
                id={fid('acc')}
                name="account_id"
                defaultValue={expense.account_id ?? KEEP_METHOD}
                aria-invalid={err('method') ? 'true' : undefined}
              >
                {/* Только для строк без конкретного счёта: даёт сохранить
                    расход, не трогая вид счёта, которым он списывался. */}
                {!expense.account_id && (
                  <option value={KEEP_METHOD}>
                    {expense.method
                      ? `${t.expenses.form.accountKeepMethod} · ${t.enums.expenseMethod[expense.method]}`
                      : t.expenses.form.accountKeepMethod}
                  </option>
                )}
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {/* Прежний вид счёта уезжает на сервер вместе с формой: если
                  выбрана опция «оставить как есть», расход должен сохранить
                  его, а не потерять. */}
              <input
                type="hidden"
                name="method"
                value={expense.method ?? ('cash' satisfies ExpenseMethod)}
              />
            </>
          ) : (
            <Select
              id={fid('acc')}
              name="method"
              defaultValue={expense.method ?? ('cash' satisfies ExpenseMethod)}
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

      <Field label={t.expenses.form.noteLabel} htmlFor={fid('note')} error={err('note')}>
        <Textarea
          id={fid('note')}
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={expense.note ?? ''}
          placeholder={t.expenses.form.notePlaceholder}
          aria-invalid={err('note') ? 'true' : undefined}
        />
      </Field>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-control border border-error/15 bg-error-bg px-3 py-2 text-[12.5px] text-error-text"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t.expenses.form.submitting : t.expenses.row.editSave}
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
        <p className="animate-field-error text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
