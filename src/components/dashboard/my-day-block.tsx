'use client';

import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  Check,
  CheckCircle2,
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

const KIND_TONE: Record<TaskKind, string> = {
  task: 'bg-primary-subtle text-primary',
  hearing: 'bg-info-bg text-info-text',
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
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text">
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
        'flex items-center gap-3 border-b border-border px-5 py-3 last:border-0',
        'transition-colors duration-[120ms] ease-out',
        done ? 'bg-surface-muted/40' : 'hover:bg-surface-muted/40',
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-label={done ? t.tasks.row.reopenAria : t.tasks.row.markDoneAria}
        className={cn(
          'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done
            ? 'border-primary bg-primary text-white'
            : 'border-border-strong bg-surface hover:border-primary hover:bg-primary-subtle',
        )}
      >
        {done && <Check size={13} strokeWidth={3} />}
      </button>

      <span
        title={t.enums.taskKind[task.kind]}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          KIND_TONE[task.kind],
        )}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{t.enums.taskKind[task.kind]}</span>
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[14px] font-medium leading-tight',
            done ? 'text-text-subtle line-through' : 'text-text',
          )}
        >
          {task.title}
        </p>
        {task.case && (
          <Link
            href={`/cases/${task.case.id}`}
            className="mt-0.5 block w-fit max-w-full truncate font-mono text-[11.5px] text-text-muted transition-colors hover:text-primary"
          >
            {task.case.number_title}
          </Link>
        )}
      </div>

      {showTime && (
        <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-1 font-mono text-[11.5px] font-semibold text-text-muted">
          {time}
        </span>
      )}
    </li>
  );
}
