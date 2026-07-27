'use client';

import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { ExpenseCategoryOption } from '@/lib/expenses/categories';
import type { CashAccount } from '@/lib/types/db';

import { ExpenseForm } from './expense-form';
import type { OptimisticExpenseInput } from './expenses-list';

interface Props {
  /** Не задано — расход фирмы (аренда, налоги, связь), без привязки к делу. */
  caseId?: string;
  categories: ExpenseCategoryOption[];
  /** Оптимистичное добавление строки в список (из ExpensesList). */
  addOptimistic?: (input: OptimisticExpenseInput) => void;
  /** Счета кассы — выбор конкретного счёта списания (0015). */
  accounts?: CashAccount[];
  /** Право заводить статьи «на лету» (manage_expense_categories). */
  canAddCategory?: boolean;
  /**
   * 'ghost' — текстовая кнопка внутри карточки дела (по умолчанию);
   * 'pill' — синяя кнопка-пилюля в шапке кассы, где это главное действие.
   */
  variant?: 'ghost' | 'pill';
}

// Добавление расхода по делу: кнопка-триггер + модалка с формой. Экшен делает
// revalidatePath по делу → обновятся список расходов и сводка Доход/Расходы/Маржа.
export function AddExpenseDialog({
  caseId,
  categories,
  addOptimistic,
  accounts,
  canAddCategory = false,
  variant = 'ghost',
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Тексты разные: трата по делу уменьшает маржу дела, расход фирмы — нет.
  const isCompany = !caseId;
  const trigger = isCompany ? t.expenses.company.add : t.expenses.addDialog.trigger;
  const title = isCompany ? t.expenses.company.addTitle : t.expenses.addDialog.title;
  const subtitle = isCompany
    ? t.expenses.company.addSubtitle
    : t.expenses.addDialog.subtitle;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          variant === 'pill'
            ? 'h-8 shrink-0 rounded-chip bg-primary-hover px-3 text-[12.5px] font-semibold text-white shadow-brand duration-[200ms] hover:-translate-y-px hover:shadow-brand-hover'
            : 'rounded-xl px-3 py-2 text-[13px] font-medium text-primary-pressed hover:bg-primary-softer',
        )}
      >
        <Plus size={14} strokeWidth={2.25} />
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={title}
        subtitle={subtitle}
        closeLabel={t.expenses.addDialog.close}
      >
        <ExpenseForm
          caseId={caseId}
          categories={categories}
          accounts={accounts}
          canAddCategory={canAddCategory}
          onSuccess={close}
          addOptimistic={addOptimistic}
        />
      </Modal>
    </>
  );
}
