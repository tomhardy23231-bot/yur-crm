'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteCaseForm } from '@/components/cases/delete-case-form';
import { ArchiveCaseForm } from '@/components/cases/archive-case-form';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

// Закреплённая (sticky) панель карточки дела — единственный дом действий дела:
// ссылки-якоря на секции слева + действия (Редактировать, Удалить) справа.
// Остаётся видимой при прокрутке длинной карточки, поэтому действия не нужно
// дублировать в шапке. Подсветка активной секции — scrollspy.

const SECTION_IDS = [
  'overview',
  'documents',
  'tasks',
  'comments',
  'history',
] as const;

export function CaseActionBar({
  caseId,
  canEdit,
  canDelete,
  canArchive = false,
  archived = false,
  caseTitle,
}: {
  caseId: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Показать кнопку «В архив»/«Восстановить» (staff, дело закрыто или уже в архиве). */
  canArchive?: boolean;
  /** Дело сейчас в архиве → кнопка «Восстановить», иначе «В архив». */
  archived?: boolean;
  caseTitle: string;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string>('overview');

  const sections = [
    { id: 'overview', label: t.caseCard.actionBar.sectionOverview },
    { id: 'documents', label: t.caseCard.actionBar.sectionDocuments },
    { id: 'tasks', label: t.caseCard.actionBar.sectionTasks },
    { id: 'comments', label: t.caseCard.actionBar.sectionComments },
    { id: 'history', label: t.caseCard.actionBar.sectionHistory },
  ] as const;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActive(visible.target.id);
      },
      // Активной считаем секцию в верхней трети вьюпорта.
      { rootMargin: '-15% 0px -75% 0px' },
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-surface/85 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* «К списку дел» переехал сюда — одна строка с навигацией, без
              отдельной полосы сверху. */}
          <Link
            href="/cases"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
          >
            <ChevronLeft size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">
              {t.caseCard.actionBar.backToList}
            </span>
          </Link>
          <span
            aria-hidden
            className="hidden h-5 w-px shrink-0 bg-border sm:block"
          />
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                active === s.id
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-muted hover:bg-surface-muted hover:text-text',
              )}
            >
              {s.label}
            </a>
            ))}
          </nav>
        </div>

        {(canEdit || canDelete || canArchive) && (
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/cases/${caseId}/edit`}>
                  <Pencil size={14} strokeWidth={1.75} />
                  {t.caseCard.actionBar.edit}
                </Link>
              </Button>
            )}
            {canArchive && (
              <ArchiveCaseForm
                caseId={caseId}
                caseTitle={caseTitle}
                mode={archived ? 'restore' : 'archive'}
                variant="button"
              />
            )}
            {canDelete && (
              <DeleteCaseForm caseId={caseId} caseTitle={caseTitle} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
