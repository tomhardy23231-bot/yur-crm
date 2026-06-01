'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  currentMonth,
  monthLabel,
  monthParam,
  nextMonth,
  prevMonth,
} from '@/lib/payroll/month';

// Переключатель месяца: ‹ Июнь 2026 ›. Меняет ?month=YYYY-MM в URL (server-компонент
// перечитает данные). Вперёд дальше текущего месяца не пускаем — там нет начислений.
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (target: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', monthParam(target));
    router.push(`${pathname}?${params.toString()}`);
  };

  const cur = currentMonth();
  const isCurrent = month >= cur;

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-sm">
      <button
        type="button"
        onClick={() => go(prevMonth(month))}
        aria-label="Предыдущий месяц"
        className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <span className="inline-flex items-center gap-1.5 px-2 text-[13px] font-semibold text-text">
        <Calendar size={14} strokeWidth={1.75} className="text-text-muted" />
        {monthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => go(nextMonth(month))}
        disabled={isCurrent}
        aria-label="Следующий месяц"
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors',
          isCurrent
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-surface-muted hover:text-text',
        )}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
