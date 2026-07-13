import Link from 'next/link';
import { AlarmClock, CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import type { TaskWithRefs } from '@/lib/types/db';
import type { UpcomingTasks } from '@/lib/tasks/queries';

// Календарная разница дней «сегодня → срок» в киевском поясе: обе даты
// приводим к ключу YYYY-MM-DD (en-CA) и делим разницу на сутки.
const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function kyivDayDiff(dueIso: string, now: Date): number {
  return Math.round(
    (Date.parse(DAY_KEY_FMT.format(new Date(dueIso))) -
      Date.parse(DAY_KEY_FMT.format(now))) /
      86_400_000,
  );
}

// Блок «Приближающиеся сроки» на главной (Шаг 10; рестайл по макету владельца
// 2026-07-08 — компактные строки для узкой колонки). Запрос фильтрует RLS —
// каждый видит только свои дела (staff — по скоупу). Просроченные идут первыми
// с красным кружком и подписью «просрочено N дней»; ближайшие 72 часа — с
// оранжевым и «через N дней». v3 Сессия 11: данные передаёт страница.
export async function UpcomingDeadlinesBlock({ data }: { data: UpcomingTasks }) {
  const { t, fmt } = await getT();
  const { overdue, overdueCount, soon } = data;

  const isEmpty = overdueCount === 0 && soon.length === 0;
  const hiddenOverdue = Math.max(0, overdueCount - overdue.length);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold text-text">
          {t.tasks.upcoming.heading}
        </h2>
        <Link
          href="/tasks?status=open&mode=all"
          className="ml-auto text-[12px] font-semibold text-primary hover:text-primary-hover"
        >
          {t.tasks.upcoming.allTasks}
        </Link>
      </div>

      {isEmpty ? (
        <EmptyState size="sm" icon={CheckCircle2} title={t.tasks.upcoming.empty} />
      ) : (
        <ul>
          {overdue.map((task) => (
            <DeadlineRow key={task.id} task={task} overdue />
          ))}
          {hiddenOverdue > 0 && (
            <li className="border-b border-border px-5 py-2 last:border-0">
              <Link
                href="/tasks?status=open&mode=all"
                className="text-[12px] font-semibold text-error hover:underline"
              >
                {fmt(t.tasks.upcoming.moreOverdue, { n: hiddenOverdue })}
              </Link>
            </li>
          )}
          {soon.map((task) => (
            <DeadlineRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </Card>
  );
}

async function DeadlineRow({
  task,
  overdue = false,
}: {
  task: TaskWithRefs;
  overdue?: boolean;
}) {
  const { t, plural } = await getT();
  const diff = task.due_at ? kyivDayDiff(task.due_at, new Date()) : null;

  const dueLabel =
    diff === null
      ? null
      : diff < 0
        ? plural(t.tasks.upcoming.overdueDays, Math.abs(diff))
        : diff === 0
          ? t.tasks.upcoming.dueToday
          : plural(t.tasks.upcoming.inDays, diff);

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
          overdue ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning',
        )}
      >
        <AlarmClock size={16} strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-tight text-text">
          {task.title}
        </p>
        {/* Подстрока «дело · срок» — формат макета (номер дела — mono). */}
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-snug">
          {task.case && (
            <>
              <Link
                href={`/cases/${task.case.id}`}
                className="truncate font-mono text-[11.5px] text-text-muted transition-colors hover:text-primary"
              >
                {task.case.number_title}
              </Link>
              {dueLabel && <span className="text-text-subtle">·</span>}
            </>
          )}
          {dueLabel && (
            <span
              className={cn(
                'shrink-0 whitespace-nowrap font-semibold',
                overdue || (diff !== null && diff <= 0)
                  ? 'text-error'
                  : 'text-text-muted',
              )}
            >
              {dueLabel}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
