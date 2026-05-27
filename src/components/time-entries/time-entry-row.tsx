import { Clock, Link2, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { deleteTimeEntryAction } from '@/lib/time-entries/actions';
import { formatMinutes } from '@/lib/time-entries/parse';
import type { TimeEntryWithRefs } from '@/lib/types/db';

interface TimeEntryRowProps {
  entry: TimeEntryWithRefs;
  /** Можно ли удалить эту запись (свои или is_staff). */
  canDelete: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function TimeEntryRow({ entry, canDelete }: TimeEntryRowProps) {
  const amount =
    entry.billable && entry.hourly_rate != null
      ? (entry.minutes / 60) * entry.hourly_rate
      : null;

  return (
    <div className="group flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted/50 transition-colors duration-[120ms] ease-out">
      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-md bg-info-bg text-info">
        <Clock size={16} strokeWidth={1.75} />
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[16px] font-bold font-mono tabular-nums text-text">
            {formatMinutes(entry.minutes)}
          </span>
          <span className="font-mono text-[12px] text-text-muted tabular-nums">
            {DATE_FMT.format(new Date(entry.spent_at + 'T00:00:00Z'))}
          </span>
          {!entry.billable && (
            <Badge tone="neutral">не оплачиваемое</Badge>
          )}
          {amount != null && (
            <span className="font-mono text-[12.5px] tabular-nums text-success font-semibold">
              {MONEY_FMT.format(amount)} ₴
            </span>
          )}
        </div>

        {entry.task && (
          <p className="inline-flex items-center gap-1 text-[12.5px] text-text-muted">
            <Link2 size={12} strokeWidth={1.75} />
            <span className="truncate">{entry.task.title}</span>
          </p>
        )}

        {entry.note && (
          <p className="text-[13px] text-text-muted break-words">{entry.note}</p>
        )}

        {entry.user && (
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <Avatar name={entry.user.full_name} size="sm" />
            <span>{entry.user.full_name}</span>
          </div>
        )}
      </div>

      {canDelete && (
        <form action={deleteTimeEntryAction} className="shrink-0">
          <input type="hidden" name="entry_id" value={entry.id} />
          <button
            type="submit"
            aria-label="Удалить запись времени"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center w-7 h-7 rounded-md text-text-subtle hover:text-error hover:bg-error-bg"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </form>
      )}
    </div>
  );
}
