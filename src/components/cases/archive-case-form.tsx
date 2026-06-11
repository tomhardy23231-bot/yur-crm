'use client';

import { useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { archiveCaseAction, unarchiveCaseAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';

// Действие «В архив» / «Восстановить».
//   variant='icon'   — иконка-кнопка для строки десктоп-списка (как RowAction);
//   variant='button' — кнопка с подписью (мобильные карточки, карточка дела).
// Настоящий <button> внутри <form> — ClickableCard игнорирует клик (правило
// INTERACTIVE), поэтому строка не навигируется. Подтверждение — ConfirmDialog
// (Сессия 5; requestSubmit после «да»). Видимость решает родитель (только staff;
// «В архив» — только у завершённых дел). Сервер всё равно перепроверяет.
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
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
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
    <form ref={formRef} action={action}>
      <input type="hidden" name="case_id" value={caseId} />
      {variant === 'button' ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
        >
          {icon}
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-text-subtle transition-colors hover:border-border hover:bg-surface-sunken hover:text-text"
        >
          {icon}
        </button>
      )}

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={fmt(confirmMsg, { title: caseTitle })}
        confirmLabel={label}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        onClose={() => setOpen(false)}
      />
    </form>
  );
}
