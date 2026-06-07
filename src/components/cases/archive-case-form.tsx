'use client';

import { Archive, ArchiveRestore } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { archiveCaseAction, unarchiveCaseAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';

// Действие «В архив» / «Восстановить».
//   variant='icon'   — иконка-кнопка для строки десктоп-списка (как RowAction);
//   variant='button' — кнопка с подписью (мобильные карточки, карточка дела).
// Настоящий <button> внутри <form> — ClickableCard игнорирует клик (правило
// INTERACTIVE), поэтому строка не навигируется. Подтверждение — window.confirm
// (зеркало DeleteCaseForm). Видимость решает родитель (только staff; «В архив» —
// только у завершённых дел). Сервер всё равно перепроверяет (staff + closed).
export function ArchiveCaseForm({
  caseId,
  caseTitle,
  mode,
  variant = 'icon',
}: {
  caseId: string;
  caseTitle: string;
  mode: 'archive' | 'restore';
  variant?: 'icon' | 'button';
}) {
  const { t, fmt } = useI18n();
  const action = mode === 'archive' ? archiveCaseAction : unarchiveCaseAction;
  const label =
    mode === 'archive'
      ? t.cases.archive.archiveAction
      : t.cases.archive.restoreAction;
  const confirmMsg =
    mode === 'archive'
      ? t.cases.archive.confirmArchive
      : t.cases.archive.confirmRestore;
  const icon =
    mode === 'archive' ? (
      <Archive size={variant === 'button' ? 14 : 15} strokeWidth={1.75} />
    ) : (
      <ArchiveRestore size={variant === 'button' ? 14 : 15} strokeWidth={1.75} />
    );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const ok = window.confirm(fmt(confirmMsg, { title: caseTitle }));
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="case_id" value={caseId} />
      {variant === 'button' ? (
        <Button type="submit" variant="secondary" size="sm">
          {icon}
          {label}
        </Button>
      ) : (
        <button
          type="submit"
          aria-label={label}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-text-subtle transition-colors hover:border-border hover:bg-surface-sunken hover:text-text"
        >
          {icon}
        </button>
      )}
    </form>
  );
}
