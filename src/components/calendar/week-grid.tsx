import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import type { AbsenceWithUser, TaskKind, TaskWithRefs } from '@/lib/types/db';

// Время события в киевском поясе; полночь = «на день, без времени».
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
});

// Цвета типов (каркас 2026-07-13): задача — синий, заседание — красный,
// срок — янтарь (единый язык с месячной сеткой и списками).
const KIND_DOT: Record<TaskKind, string> = {
  task: 'bg-primary',
  hearing: 'bg-error',
  deadline: 'bg-warning',
};

export type WeekDayCell = {
  date: Date;
  key: string;
  isToday: boolean;
  isSelected: boolean;
  href: string;
  tasks: TaskWithRefs[];
  absences: AbsenceWithUser[];
};

// ============================================================================
// Недельный вид календаря: 7 колонок-дней (на мобильных — вертикальный список)
// с полными списками событий дня. Клик по дню открывает ту же панель дня, что
// и в месячной сетке (?day=…).
// ============================================================================

export async function WeekGrid({
  days,
  weekdayLabels,
}: {
  days: WeekDayCell[];
  weekdayLabels: string[];
}) {
  const { t } = await getT();

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day, i) => {
          const dayNum = day.date.getDate();
          const sortedTasks = [...day.tasks].sort((a, b) =>
            (a.due_at ?? '').localeCompare(b.due_at ?? ''),
          );
          return (
            <Link
              key={day.key}
              href={day.href}
              className={cn(
                'flex min-h-[76px] flex-col gap-1.5 border-b border-border p-2.5 transition-colors duration-[120ms] ease-out sm:min-h-[300px] sm:border-b-0 sm:border-r last:border-b-0 sm:last:border-r-0',
                day.isSelected ? '!bg-primary-subtle' : 'hover:bg-primary-softer',
              )}
            >
              {/* Шапка дня: «Пн · 8», сегодняшний день — синим. */}
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.05em]',
                    day.isToday ? 'text-primary' : 'text-text-subtle',
                  )}
                >
                  {weekdayLabels[i]}
                </span>
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold',
                    day.isToday ? 'bg-primary text-primary-fg' : 'text-text',
                  )}
                >
                  {dayNum}
                </span>
              </div>

              {/* Отсутствия — сверху, violet-плашкой. */}
              {day.absences.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {day.absences.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-1.5 rounded-md bg-absence-bg px-1.5 py-1 text-[11px] leading-tight"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-absence"
                        aria-hidden="true"
                      />
                      <span className="truncate text-text">
                        {a.user?.full_name ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Задачи дня — по времени. */}
              {sortedTasks.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {sortedTasks.map((task) => {
                    const time = task.due_at
                      ? TIME_FMT.format(new Date(task.due_at))
                      : null;
                    const done = task.status === 'done';
                    return (
                      <li
                        key={task.id}
                        className={cn(
                          'flex items-start gap-1.5 text-[11.5px] leading-tight',
                          done && 'opacity-50',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full',
                            KIND_DOT[task.kind],
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          {time && time !== '00:00' && (
                            <span className="mr-1 font-mono font-semibold tabular-nums text-text">
                              {time}
                            </span>
                          )}
                          <span
                            className={cn('text-text', done && 'line-through')}
                          >
                            {task.title}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                day.absences.length === 0 && (
                  <span className="hidden text-[11px] text-text-subtle sm:block">
                    {t.calendar.noTasksDay}
                  </span>
                )
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
