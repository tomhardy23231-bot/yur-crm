'use client';

import { Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { ExpenseWithRefs } from '@/lib/types/db';

import { ExpenseEditForm } from './expense-edit-form';

// Кнопка-карандаш + модалка правки расхода. Стоит там же, где корзинка:
// в списке расходов фирмы (касса, вкладка «Витрати») и в списке расходов дела.
// Зарплатные строки правятся через саму выплату — их сюда не пускает вызывающий.
export function EditExpenseDialog({
  expense,
  categories,
  accounts,
  alwaysVisible = false,
}: {
  expense: ExpenseWithRefs;
  categories: ExpenseCategoryOption[];
  accounts?: ReadonlyArray<{ id: string; name: string; is_active?: boolean }>;
  /** Показывать кнопку постоянно (в списках без hover-групп). */
  alwaysVisible?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.expenses.row.editLabel}
        title={t.expenses.row.editLabel}
        className={
          alwaysVisible
            ? 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-subtle transition-colors hover:bg-primary-softer hover:text-primary-pressed'
            : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-subtle opacity-0 transition-opacity hover:bg-primary-softer hover:text-primary-pressed focus:opacity-100 group-hover:opacity-100'
        }
      >
        <Pencil size={13} strokeWidth={1.75} />
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.expenses.row.editTitle}
        subtitle={t.expenses.row.editHint}
        closeLabel={t.common.close}
      >
        <ExpenseEditForm
          expense={expense}
          categories={categories}
          accounts={accounts}
          onSuccess={close}
          onCancel={close}
        />
      </Modal>
    </>
  );
}
