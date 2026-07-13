'use client';

import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Gavel,
  type LucideIcon,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { toggleTaskStatusAction } from '@/lib/tasks/actions';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { TaskKind, TaskWithRefs } from '@/lib/types/db';

// Время задачи в киевском поясе (HH:MM). Полночь (00:00) трактуем как «срок
// на день без конкретного времени» — время не показываем.
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
});

// Иконка и тинт типа задачи — тона совпадают с TaskKindBadge (task neutral,
// hearing info, deadline warning), чтобы цветовой язык был единым с /tasks.
const KIND_ICON: Record<TaskKind, LucideIcon> = {
  task: ClipboardList,
  hearing: Gavel,
  deadline: AlarmClock,
};

// Каркас 2026-07-13: задача — синий, заседание (суд) — красный, срок — янтарь.
const KIND_TONE: Record<TaskKind, string> = {
  task: 'bg-primary-subtle text-primary',
  hearing: 'bg-error-bg text-error',
  deadline: 'bg-warning-bg text-warning',
};

// ============================================================================
// «Мой день» (v3 s11, рестайл по макету владельца 2026-07-08) — задачи
// текущего пользователя со сроком сегодня (Киев): чекбокс «выполнено» прямо
// с дашборда (оптимистично, как TaskRow), иконка типа в тинт-кружке, дело
// подстрокой, время справа в бейджике. Пустой день — позитивный empty-state.
// ============================================================================

export function MyDayBlock({ tasks }: { tasks: TaskWithRefs[] }) {
  const { t, plural } = useI18n();

  return (
    <Card className="animate-fade-in-up">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold text-text">
          {t.dashboard.myDay.heading}
        </h2>
        {tasks.length > 0 && (
          <span className="text-[12px] text-text-muted">
            · {plural(t.dashboard.myDay.count, tasks.length)}
          </span>
        )}
        <Link
          href="/tasks"
          className="ml-auto text-[12px] font-semibold text-primary hover:text-primary-hover"
        >
          {t.tasks.upcoming.allTasks}
        </Link>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CheckCircle2}
          title={t.dashboard.myDay.empty}
        />
      ) : (
        <ul>
          {tasks.map((task) => (
            <MyDayRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function MyDayRow({ task }: { task: TaskWithRefs }) {
  const { t } = useI18n();
  // Оптимистичный статус (паттерн TaskRow): галочка и перечёркивание — сразу,
  // не дожидаясь round-trip + revalidate. Права проверяют action и RLS.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(task.status);
  const [pending, startToggle] = useTransition();
  const done = optimisticStatus === 'done';

  const Icon = KIND_ICON[task.kind];
  const time = task.due_at ? TIME_FMT.format(new Date(task.due_at)) : null;
  const showTime = time !== null && time !== '00:00';

  function handleToggle() {
    const current = optimisticStatus;
    const next = current === 'open' ? 'done' : 'open';
    startToggle(async () => {
      setOptimisticStatus(next);
      const fd = new FormData();
      fd.set('task_id', task.id);
      fd.set('current_status', current);
      fd.set('case_id', task.case_id);
      await toggleTaskStatusAction(fd);
    });
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0',
        'transition-colors duration-[150ms] ease-out',
        done ? 'bg-surface-muted/40' : 'hover:bg-primary-softer',
      )}
    >
      {/* Чекбокс-круг (каркас): пустой круг → синяя галочка. */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-label={done ? t.tasks.row.reopenAria : t.tasks.row.markDoneAria}
        className="shrink-0"
      >
        {done ? (
          <CheckCircle2 size={20} strokeWidth={2.2} className="text-primary" />
        ) : (
          <Circle
            size={20}
            strokeWidth={1.8}
            className="text-text-subtle transition-colors hover:text-primary"
          />
        )}
      </button>

      <span
        title={t.enums.taskKind[task.kind]}
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          KIND_TONE[task.kind],
        )}
      >
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">{t.enums.taskKind[task.kind]}</span>
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[13.5px] font-medium leading-tight',
            done ? 'text-text-subtle line-through' : 'text-text',
          )}
        >
          {task.title}
        </p>
        {task.case && (
          <Link
            href={`/cases/${task.case.id}`}
            className="mt-0.5 block w-fit max-w-full truncate font-mono text-[11.5px] text-text-subtle transition-colors hover:text-primary"
          >
            {task.case.number_title}
          </Link>
        )}
      </div>

      {showTime && (
        <span className="shrink-0 rounded-lg bg-surface-sunken px-2.5 py-1 font-mono text-[12px] font-semibold text-text-muted tabular-nums">
          {time}
        </span>
      )}
    </li>
  );
}
