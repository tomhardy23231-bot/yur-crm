'use client';

import { useOptimistic } from 'react';
import { Receipt } from 'lucide-react';

import { AddExpenseDialog } from '@/components/expenses/add-expense-dialog';
import { DeleteExpenseButton } from '@/components/expenses/delete-expense-button';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { ExpenseMethod, ExpenseWithRefs } from '@/lib/types/db';

// Клиентский список расходов по делу + диалог добавления под одним useOptimistic
// (зеркало PaymentsList). Новый расход появляется сразу «призрак»-строкой,
// локальный итог пересчитывается; сводка Доход/Расходы/Маржа в карточке дела
// оптимистично НЕ трогается — придёт с revalidate.
//
// Отличие от платежей: суммы показываем со знаком «−» и в error-тоне — это
// деньги, ушедшие со счёта. На долг клиента и зарплату они не влияют.
export type OptimisticExpenseInput = {
  /** Стабильный id «призрака» — генерится в expense-form (не в reducer). */
  id: string;
  amount: number;
  spent_at: string;
  method: ExpenseMethod;
  note: string | null;
  categoryLabel: string;
};

type OptimisticExpense = ExpenseWithRefs & { pending?: boolean };

interface Props {
  expenses: ExpenseWithRefs[];
  caseId: string;
  categories: ExpenseCategoryOption[];
  /** Может ли добавлять/удалять расход (право manage_case_expenses). */
  canManage: boolean;
  /**
   * Счета кассы — если вносящий их видит (есть права кассы), он выбирает
   * КОНКРЕТНЫЙ счёт списания; иначе остаётся выбор вида счёта.
   */
  accounts?: ReadonlyArray<{ id: string; name: string; is_active?: boolean }>;
  /** Право заводить статьи «на лету» (manage_expense_categories). */
  canAddCategory?: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function ExpensesList({
  expenses,
  caseId,
  categories,
  canManage,
  accounts,
  canAddCategory = false,
}: Props) {
  const { t } = useI18n();
  const b = t.expenses.block;

  const [optimistic, addOptimistic] = useOptimistic(
    expenses as OptimisticExpense[],
    (state, input: OptimisticExpenseInput) => [
      {
        id: input.id,
        case_id: caseId,
        category_id: '',
        amount: input.amount,
        spent_at: input.spent_at,
        method: input.method,
        note: input.note,
        created_by: '',
        created_at: new Date().toISOString(),
        payroll_transaction_id: null,
        account_id: null,
        category: { id: '', code: '', label: input.categoryLabel },
        creator: null,
        pending: true,
      },
      ...state,
    ],
  );

  const total = optimistic.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      {/* Заголовок: «Расходы · N» + итог (оптимистичные). */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold text-text">
          {b.heading}
          <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 font-mono text-[11px] text-text-subtle">
            {optimistic.length}
          </span>
        </span>
        {optimistic.length > 0 && (
          <span className="text-[12px] tabular-nums text-text-muted">
            {b.total}{' '}
            <span className="font-mono font-bold text-warning-text">
              {formatMoney(total)} ₴
            </span>
          </span>
        )}
      </div>

      {optimistic.length === 0 ? (
        <p className="mb-2.5 text-[12px] text-text-subtle">
          {canManage ? b.emptyCanWrite : b.empty}
        </p>
      ) : (
        <ul className="mb-3">
          {optimistic.map((e) => (
            <li
              key={e.id}
              className={
                'group flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0' +
                (e.pending ? ' opacity-60' : '')
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning-text">
                <Receipt size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text">
                  {[e.category.label, e.note].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11.5px] tabular-nums text-text-subtle">
                  {e.pending
                    ? t.expenses.form.submitting
                    : [
                        DATE_FMT.format(new Date(e.spent_at + 'T00:00:00Z')),
                        e.method ? t.enums.expenseMethod[e.method] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[14px] font-bold tabular-nums text-warning-text">
                −{formatMoney(e.amount)} ₴
              </span>
              {canManage && !e.pending && (
                <DeleteExpenseButton expenseId={e.id} caseId={e.case_id ?? ''} />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <AddExpenseDialog
          caseId={caseId}
          categories={categories}
          accounts={accounts}
          canAddCategory={canAddCategory}
          addOptimistic={addOptimistic}
        />
      )}
    </div>
  );
}
