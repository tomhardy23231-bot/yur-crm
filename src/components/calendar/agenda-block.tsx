import Link from 'next/link';
import { Sun } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { TaskKindBadge } from '@/components/tasks/task-kind-badge';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import type { AbsenceWithUser, TaskWithRefs } from '@/lib/types/db';

// Время события в киевском поясе; полночь = «срок на день без времени».
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
});

// ============================================================================
// Повестка дня «Сегодня» над сеткой календаря: все видимые события сегодняшнего
// дня (задачи/заседания/дедлайны по порядку времени) + отсутствующие сотрудники.
// Пустой день → блок не рендерится (как MyDayBlock на дашборде).
// ============================================================================

export async function AgendaBlock({
  tasks,
  absences,
}: {
  tasks: TaskWithRefs[];
  absences: AbsenceWithUser[];
}) {
  if (tasks.length === 0 && absences.length === 0) return null;
  const { t, plural } = await getT();

  const sorted = [...tasks].sort((a, b) =>
    (a.due_at ?? '').localeCompare(b.due_at ?? ''),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Sun size={14} strokeWidth={1.75} />
        </span>
        <h2 className="text-[16px] font-semibold text-text">
          {t.calendar.agendaTitle}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.calendar.taskCount, sorted.length)}
        </span>
      </div>

      <ul>
        {sorted.map((task) => {
          const time = task.due_at ? TIME_FMT.format(new Date(task.due_at)) : null;
          const done = task.status === 'done';
          return (
            <li
              key={task.id}
              className={cn(
                'flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0',
                done && 'opacity-50',
              )}
            >
              <span className="w-[44px] shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-text">
                {time && time !== '00:00' ? time : '—'}
              </span>
              <TaskKindBadge kind={task.kind} />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13.5px] text-text',
                  done && 'line-through',
                )}
              >
                {task.title}
              </span>
              {task.case && (
                <Link
                  href={`/cases/${task.case.id}`}
                  className="max-w-[40%] shrink-0 truncate font-mono text-[12px] tabular-nums text-primary hover:underline"
                >
                  {task.case.number_title}
                </Link>
              )}
            </li>
          );
        })}
        {absences.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0"
          >
            <span className="w-[44px] shrink-0 text-[13px] text-text-subtle">—</span>
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-absence"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">
              {a.user?.full_name ?? '—'}
            </span>
            <span className="shrink-0 text-[12.5px] text-text-muted">
              {t.enums.absenceKind[a.kind]}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
