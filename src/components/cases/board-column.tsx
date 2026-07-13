import Link from 'next/link';
import { CheckCircle2, Inbox, Plus } from 'lucide-react';

import { BoardCard } from '@/components/cases/board-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BOARD_COLUMN_CAP,
  type BoardCaseItem,
} from '@/lib/cases/queries';
import { type CaseStage } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';

// Цветовой токен заголовка колонки — по стадии. Чёрно-белый закрытый
// этап выделен mute'ом, остальные несут цвет воронки (DESIGN.md §6).
const STAGE_HEADER: Record<CaseStage, string> = {
  new_request: 'text-stage-new bg-stage-new-bg',
  consultation: 'text-stage-consultation bg-stage-consultation-bg',
  in_progress: 'text-stage-in-progress bg-stage-in-progress-bg',
  awaiting_decision: 'text-stage-awaiting bg-stage-awaiting-bg',
  closed: 'text-stage-closed bg-stage-closed-bg',
};

export async function BoardColumn({
  stage,
  cases,
  nextStageLabel,
  canAdvanceFor,
  showNewCaseCta = false,
}: {
  stage: CaseStage;
  cases: BoardCaseItem[];
  nextStageLabel: string | null;
  // Возвращает true, если текущий пользователь может двигать данное дело
  // вперёд (юрист/Експерт дела или staff).
  canAdvanceFor: (c: BoardCaseItem) => boolean;
  /** CTA «Новое дело» в пустой колонке (первая колонка + staff). */
  showNewCaseCta?: boolean;
}) {
  const { t, fmt } = await getT();
  const visible = cases.slice(0, BOARD_COLUMN_CAP);
  const overflow = cases.length - visible.length;
  const isClosed = stage === 'closed';

  return (
    <section
      className={cn(
        'flex flex-col w-[280px] shrink-0 bg-surface-muted/40 rounded-lg border border-border',
        'max-h-[calc(100vh-13rem)]',
      )}
      aria-label={fmt(t.cases.column.aria, { stage: t.enums.caseStage[stage] })}
    >
      <header
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-lg',
          'border-b border-border',
          STAGE_HEADER[stage],
        )}
      >
        <h2 className="text-[12px] uppercase tracking-[0.05em] font-bold leading-tight">
          {t.enums.caseStage[stage]}
        </h2>
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full',
            'text-[11px] font-bold tabular-nums',
            'bg-white/70 text-current',
          )}
          aria-label={fmt(t.cases.column.countAria, { count: cases.length })}
        >
          {cases.length}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            icon={isClosed ? CheckCircle2 : Inbox}
            title={isClosed ? t.cases.column.emptyClosed : t.cases.column.empty}
            action={
              showNewCaseCta ? (
                <Button asChild size="sm">
                  <Link href="/cases/new">
                    <Plus size={14} strokeWidth={2} />
                    {t.cases.toolbar.newCase}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          visible.map((c) => (
            <BoardCard
              key={c.id}
              c={c}
              canAdvance={!isClosed && canAdvanceFor(c)}
              nextStageLabel={nextStageLabel}
            />
          ))
        )}
        {overflow > 0 && (
          <p className="text-[11.5px] text-text-subtle text-center py-2">
            {fmt(t.cases.column.overflow, { n: overflow })}
          </p>
        )}
      </div>
    </section>
  );
}
