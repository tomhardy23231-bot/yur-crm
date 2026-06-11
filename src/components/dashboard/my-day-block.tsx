import Link from 'next/link';
import { Sun } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { TaskKindBadge } from '@/components/tasks/task-kind-badge';
import { getT } from '@/lib/i18n/server';
import type { TaskWithRefs } from '@/lib/types/db';

// Время задачи в киевском поясе (HH:MM). Полночь (00:00) трактуем как «срок
// на день без конкретного времени» — время не показываем.
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
});

// ============================================================================
// «Мой день» (v3 Сессия 11) — над KPI для всех ролей: открытые задачи /
// заседания / дедлайны ТЕКУЩЕГО пользователя со сроком сегодня (по Киеву).
// Данные — срез today из listUpcomingTasks (страница передаёт пропом, чтобы
// не дублировать запросы). Пустой список → блок не рендерится вообще.
// ============================================================================

export async function MyDayBlock({ tasks }: { tasks: TaskWithRefs[] }) {
  if (tasks.length === 0) return null;
  const { t, plural } = await getT();

  return (
    <Card className="animate-fade-in-up">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Sun size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.dashboard.myDay.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.dashboard.myDay.count, tasks.length)}
        </span>
      </div>

      <ul>
        {tasks.map((task) => {
          const time = task.due_at ? TIME_FMT.format(new Date(task.due_at)) : null;
          return (
            <li
              key={task.id}
              className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0"
            >
              <span className="w-[44px] shrink-0 text-[13px] font-medium tabular-nums text-text">
                {time && time !== '00:00' ? time : '—'}
              </span>
              <TaskKindBadge kind={task.kind} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">
                {task.title}
              </span>
              {task.case && (
                <Link
                  href={`/cases/${task.case.id}`}
                  className="max-w-[40%] shrink-0 truncate text-[12.5px] text-primary hover:underline"
                >
                  {task.case.number_title}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
