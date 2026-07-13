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

// Точка этапа в заголовке колонки (каркас 2026-07-13: заголовок с цветной
// точкой над тонированным контейнером, без залитой шапки).
const STAGE_DOT: Record<CaseStage, string> = {
  new_request: 'bg-stage-new',
  consultation: 'bg-stage-consultation',
  in_progress: 'bg-stage-in-progress',
  awaiting_decision: 'bg-stage-awaiting',
  closed: 'bg-stage-closed',
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
        'flex flex-col w-[280px] shrink-0 gap-3',
        'max-h-[calc(100vh-13rem)]',
      )}
      aria-label={fmt(t.cases.column.aria, { stage: t.enums.caseStage[stage] })}
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-[12.5px] font-semibold leading-tight text-text">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_DOT[stage])}
          />
          {t.enums.caseStage[stage]}
        </h2>
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-muted"
          aria-label={fmt(t.cases.column.countAria, { count: cases.length })}
        >
          {cases.length}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-card bg-surface-sunken/50 p-2.5">
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
