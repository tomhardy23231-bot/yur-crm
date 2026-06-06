'use client';

import Link from 'next/link';
import { Check, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import {
  deleteTaskAction,
  toggleTaskStatusAction,
} from '@/lib/tasks/actions';
import type { TaskWithRefs } from '@/lib/types/db';

import { TaskKindBadge } from './task-kind-badge';

interface TaskRowProps {
  task: TaskWithRefs;
  /** Можно ли изменить статус и удалить (write-permission на дело). */
  canManage: boolean;
  /** Показывать ли ссылку на дело (для /tasks и /calendar). */
  showCase?: boolean;
}

const DATETIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function TaskRow({ task, canManage, showCase = false }: TaskRowProps) {
  const { t } = useI18n();
  const done = task.status === 'done';

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0',
        'transition-colors duration-[120ms] ease-out',
        done ? 'bg-surface-muted/40' : 'hover:bg-surface-muted/50',
      )}
    >
      {/* Toggle status */}
      {canManage ? (
        <form action={toggleTaskStatusAction} className="shrink-0 mt-0.5">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="current_status" value={task.status} />
          <input type="hidden" name="case_id" value={task.case_id} />
          <button
            type="submit"
            aria-label={done ? t.tasks.row.reopenAria : t.tasks.row.markDoneAria}
            className={cn(
              'inline-flex items-center justify-center w-5 h-5 rounded-md border transition-colors',
              done
                ? 'bg-success text-white border-success'
                : 'bg-surface border-border-strong hover:border-primary hover:bg-primary-subtle',
            )}
          >
            {done && <Check size={12} strokeWidth={3} />}
          </button>
        </form>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md border',
            done
              ? 'bg-success text-white border-success'
              : 'bg-surface-muted border-border',
          )}
        >
          {done && <Check size={12} strokeWidth={3} />}
        </span>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p
            className={cn(
              'text-[14px] font-medium leading-tight break-words',
              done
                ? 'line-through text-text-subtle'
                : 'text-text',
            )}
          >
            {task.title}
          </p>
          <TaskKindBadge kind={task.kind} />
        </div>

        {task.description && (
          <p
            className={cn(
              'text-[12.5px] leading-[1.5] break-words',
              done ? 'text-text-subtle' : 'text-text-muted',
            )}
          >
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
          {task.due_at && (
            <span
              className={cn(
                '',
                !done && isOverdue(task.due_at) && 'text-error font-semibold',
              )}
            >
              {formatDue(task.due_at)}
            </span>
          )}
          {task.assignee && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={task.assignee.full_name} size="sm" />
              <span>{task.assignee.full_name}</span>
            </span>
          )}
          {showCase && task.case && (
            <Link
              href={`/cases/${task.case.id}`}
              className="hover:text-primary transition-colors"
            >
              · {task.case.number_title}
            </Link>
          )}
        </div>
      </div>

      {canManage && (
        <form action={deleteTaskAction} className="shrink-0">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="case_id" value={task.case_id} />
          <button
            type="submit"
            aria-label={t.tasks.row.deleteAria}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center w-7 h-7 rounded-md text-text-subtle hover:text-error hover:bg-error-bg"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </form>
      )}
    </div>
  );
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    return DATE_ONLY_FMT.format(d);
  }
  if (sameYear) return DATETIME_FMT.format(d);
  return DATE_ONLY_FMT.format(d) + ' ' + DATETIME_FMT.format(d).slice(-5);
}
