import { BoardCard } from '@/components/cases/board-card';
import {
  BOARD_COLUMN_CAP,
  type BoardCaseItem,
} from '@/lib/cases/queries';
import {
  CASE_STAGE_LABEL,
  type CaseStage,
} from '@/lib/types/db';
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

export function BoardColumn({
  stage,
  cases,
  nextStageLabel,
  canAdvanceFor,
}: {
  stage: CaseStage;
  cases: BoardCaseItem[];
  nextStageLabel: string | null;
  // Возвращает true, если текущий пользователь может двигать данное дело
  // вперёд (юрист/Експерт дела или staff).
  canAdvanceFor: (c: BoardCaseItem) => boolean;
}) {
  const visible = cases.slice(0, BOARD_COLUMN_CAP);
  const overflow = cases.length - visible.length;
  const isClosed = stage === 'closed';

  return (
    <section
      className={cn(
        'flex flex-col w-[280px] shrink-0 bg-surface-muted/40 rounded-lg border border-border',
        'max-h-[calc(100vh-13rem)]',
      )}
      aria-label={`Колонка ${CASE_STAGE_LABEL[stage]}`}
    >
      <header
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-lg',
          'border-b border-border',
          STAGE_HEADER[stage],
        )}
      >
        <h2 className="text-[12px] uppercase tracking-[0.05em] font-bold leading-tight">
          {CASE_STAGE_LABEL[stage]}
        </h2>
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full',
            'text-[11px] font-bold tabular-nums',
            'bg-white/70 text-current',
          )}
          aria-label={`${cases.length} дел в колонке`}
        >
          {cases.length}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center px-3 py-8 text-center">
            <p className="text-[12px] text-text-subtle">
              {isClosed ? 'Пока ничего не завершено' : 'Пока пусто'}
            </p>
          </div>
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
            и ещё {overflow}…
          </p>
        )}
      </div>
    </section>
  );
}
