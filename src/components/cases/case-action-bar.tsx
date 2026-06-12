'use client';

import Link from 'next/link';
import { ChevronLeft, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteCaseForm } from '@/components/cases/delete-case-form';
import { ArchiveCaseForm } from '@/components/cases/archive-case-form';
import { MarkLostButton } from '@/components/cases/mark-lost-button';
import { useI18n } from '@/lib/i18n/provider';

// Закреплённая (sticky) панель карточки дела: «К списку» слева + действия
// (Редактировать, В архив, Удалить) справа. Навигация по разделам переехала в
// настоящие вкладки (CaseTabs, редизайн Волна 1), поэтому здесь — только
// возврат к списку и действия над делом.
export function CaseActionBar({
  caseId,
  canEdit,
  canDelete,
  canArchive = false,
  canMarkLost = false,
  archived = false,
  caseTitle,
}: {
  caseId: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Показать кнопку «В архив»/«Восстановить» (staff, дело закрыто или уже в архиве). */
  canArchive?: boolean;
  /** Показать «Не уклали» (закрытие как lost) — до контракта, staff/юрист. Редизайн
   *  Волна 1: деструктив переехал сюда из шапки (не рядом со степпером этапа). */
  canMarkLost?: boolean;
  /** Дело сейчас в архиве → кнопка «Восстановить», иначе «В архив». */
  archived?: boolean;
  caseTitle: string;
}) {
  const { t } = useI18n();

  return (
    <div className="sticky top-0 z-30 -mx-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface/85 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
      <Link
        href="/cases"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />
        <span>{t.caseCard.actionBar.backToList}</span>
      </Link>

      {(canEdit || canDelete || canArchive || canMarkLost) && (
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/cases/${caseId}/edit`}>
                <Pencil size={14} strokeWidth={1.75} />
                {t.caseCard.actionBar.edit}
              </Link>
            </Button>
          )}
          {canMarkLost && <MarkLostButton caseId={caseId} />}
          {canArchive && (
            <ArchiveCaseForm
              caseId={caseId}
              caseTitle={caseTitle}
              mode={archived ? 'restore' : 'archive'}
              variant="button"
            />
          )}
          {canDelete && <DeleteCaseForm caseId={caseId} caseTitle={caseTitle} />}
        </div>
      )}
    </div>
  );
}
