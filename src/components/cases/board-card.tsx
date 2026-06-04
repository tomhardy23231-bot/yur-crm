import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { CategoryBadge } from '@/components/ui/category-badge';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { advanceCaseStageAction } from '@/lib/cases/actions';
import { cn } from '@/lib/utils';
import { type CaseStage } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';
import type { BoardCaseItem } from '@/lib/cases/queries';

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Карточка дела на канбан-доске.
// canAdvance — может ли текущий пользователь двигать дело вперёд (RLS + не closed).
export async function BoardCard({
  c,
  canAdvance,
  nextStageLabel,
}: {
  c: BoardCaseItem;
  canAdvance: boolean;
  nextStageLabel: string | null;
}) {
  const { t, fmt } = await getT();
  const isUrgent = c.priority === 'urgent';
  const isClosed: boolean = (c.stage as CaseStage) === 'closed';

  return (
    <article
      className={cn(
        'group relative bg-surface rounded-md border shadow-sm transition-shadow',
        'hover:shadow-md',
        isUrgent ? 'border-prio-high/40' : 'border-border',
      )}
    >
      <Link
        href={`/cases/${c.id}`}
        className="block px-3 pt-3 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="font-semibold text-[13.5px] text-text group-hover:text-primary transition-colors truncate">
            {c.number_title}
          </span>
          {isUrgent && <PriorityBadge priority={c.priority} />}
        </div>

        {c.client && (
          <p className="text-[12.5px] text-text-muted truncate mb-2">
            {c.client.name}
          </p>
        )}

        <div className="flex items-center gap-2">
          <CategoryBadge category={c.category} quiet />
          <span className="text-[11.5px] text-text-subtle">
            {t.enums.caseType[c.case_type]}
          </span>
        </div>
      </Link>

      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 border-t border-border',
          isClosed ? 'bg-stage-closed-bg/40' : 'bg-surface-muted/30',
        )}
      >
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
            'text-[11.5px] font-mono tabular-nums whitespace-nowrap',
            c.debt > 0 ? 'text-error' : 'text-text-subtle',
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
