'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { deleteExpenseAction } from '@/lib/expenses/actions';

// Удаление расхода — с подтверждением: вместе со строкой снимается и операция
// кассы (FK cascade), поэтому действие заметнее обычного.
// Вынесено из expenses-list.tsx (2026-07-26): используется и на карточке дела,
// и во вкладке «Витрати» кассы.
export function DeleteExpenseButton({
  expenseId,
  caseId,
  /** По умолчанию кнопка проявляется на hover строки (родитель — .group). */
  alwaysVisible = false,
}: {
  expenseId: string;
  /** Пусто = расход фирмы (case_id NULL). */
  caseId: string;
  alwaysVisible?: boolean;
}) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <form ref={formRef} action={deleteExpenseAction} className="shrink-0">
      <input type="hidden" name="expense_id" value={expenseId} />
      <input type="hidden" name="case_id" value={caseId} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.expenses.row.deleteLabel}
        title={t.expenses.row.deleteLabel}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md text-text-subtle transition-opacity hover:bg-error-bg hover:text-error',
          !alwaysVisible && 'opacity-0 focus:opacity-100 group-hover:opacity-100',
        )}
      >
        <Trash2 size={13} strokeWidth={1.75} />
      </button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={t.expenses.row.deleteConfirm}
        confirmLabel={t.common.delete}
        tone="danger"
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        onClose={() => setOpen(false)}
      />
    </form>
  );
}
