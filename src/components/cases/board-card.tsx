import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { CategoryBadge } from '@/components/ui/category-badge';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { advanceCaseStageAction } from '@/lib/cases/actions';
import { cn, daysSince } from '@/lib/utils';
import { STALE_STAGE_DAYS } from '@/lib/cases/constants';
import { type CaseStage } from '@/lib/types/db';
import { caseTypeLabeler } from '@/lib/cases/case-types';
import { getT } from '@/lib/i18n/server';
import type { BoardCaseItem } from '@/lib/cases/queries';

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Карточка дела на канбан-доске.
// canAdvance — может ли текущий пользователь двигать дело вперёд (RLS + не closed).
// v3 s11 — паритет со строкой списка: клиент 13px, индикатор застоя (amber-точка,
// БЕЗ анимации — запрет infinite в списках), hover без теней (только бордер).
export async function BoardCard({
  c,
  canAdvance,
  nextStageLabel,
}: {
  c: BoardCaseItem;
  canAdvance: boolean;
  nextStageLabel: string | null;
}) {
  const { t, fmt, plural } = await getT();
  const caseTypeLabel = (await caseTypeLabeler())(c.case_type);
  const isUrgent = c.priority === 'urgent';
  const isClosed: boolean = (c.stage as CaseStage) === 'closed';
  // Индикатор застоя — как в списке (U6): дни на текущем этапе ≥ порога.
  const stageDays = isClosed ? null : daysSince(c.stage_changed_at);
  const isStale = stageDays !== null && stageDays >= STALE_STAGE_DAYS;

  return (
    <article
      className={cn(
        // Каркас 2026-07-13: карточка доски мягко приподнимается на hover.
        'group relative bg-surface rounded-xl border shadow-sm',
        'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
        isUrgent ? 'border-prio-high/40' : 'border-border hover:border-primary-border',
      )}
    >
      <Link
        href={`/cases/${c.id}`}
        className="block px-3 pt-3 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-xl"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {isStale && (
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] shrink-0 rounded-full bg-warning"
              />
            )}
            <span
              className="truncate font-semibold text-[13.5px] text-text group-hover:text-primary transition-colors"
              title={isStale ? plural(t.cases.row.stageDaysTitle, stageDays ?? 0) : undefined}
            >
              {c.number_title}
            </span>
          </span>
          {isUrgent && <PriorityBadge priority={c.priority} />}
        </div>

        {c.client && (
          <p className="mb-2 truncate font-mono text-[11.5px] text-text-subtle">
            {c.client.name}
          </p>
        )}

        <div className="flex items-center gap-2">
          <CategoryBadge category={c.category} quiet />
          <span className="text-[11.5px] text-text-subtle">
            {caseTypeLabel}
          </span>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {c.responsible ? (
            <>
              <Avatar name={c.responsible.full_name} size="sm" />
              <span className="text-[11.5px] text-text-muted truncate">
                {c.responsible.full_name}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-text-subtle">{t.cases.board.noResponsible}</span>
          )}
        </div>
        <span
          className={cn(
            'font-mono text-[12px] font-semibold tabular-nums whitespace-nowrap',
            c.debt > 0 ? 'text-error' : 'text-text',
          )}
          title={c.debt > 0 ? t.cases.board.debtTitle : t.cases.board.noDebtTitle}
        >
          {c.debt > 0 ? `−${MONEY_FMT.format(c.debt)} ₴` : `${MONEY_FMT.format(c.contract_sum)} ₴`}
        </span>
      </div>

      {canAdvance && nextStageLabel && (
        <form action={advanceCaseStageAction}>
          <input type="hidden" name="case_id" value={c.id} />
          <input type="hidden" name="from_stage" value={c.stage} />
          <button
            type="submit"
            className={cn(
              'absolute -right-2 top-3 inline-flex items-center justify-center',
              'w-6 h-6 rounded-full bg-primary text-white shadow-sm',
              'opacity-0 group-hover:opacity-100 focus:opacity-100',
              'transition-opacity duration-[80ms] hover:bg-primary/90',
            )}
            title={`→ ${nextStageLabel}`}
            aria-label={fmt(t.cases.board.advanceAria, {
              number: c.number_title,
              stage: nextStageLabel,
            })}
          >
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </form>
      )}
    </article>
  );
}
