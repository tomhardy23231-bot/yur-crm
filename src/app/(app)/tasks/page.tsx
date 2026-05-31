import Link from 'next/link';
import { Calendar, CheckSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TaskRow } from '@/components/tasks/task-row';
import { TasksFilterSelect } from '@/components/tasks/tasks-filter-select';
import { requireUser } from '@/lib/auth/require-role';
import { listTasksForUser, TASKS_PAGE_SIZE } from '@/lib/tasks/queries';
import {
  STAFF_ROLES,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type TaskStatus,
  type TaskWithRefs,
} from '@/lib/types/db';

function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    mode?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const status = sp.status && isTaskStatus(sp.status) ? sp.status : undefined;
  const mode: 'mine' | 'all' = sp.mode === 'all' ? 'all' : 'mine';
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // Для не-staff режим 'all' покажет только видимые им задачи (через RLS),
  // что = их же задачам. Поэтому не показываем переключатель.
  const showModeToggle = isStaff;

  const { items, pageCount } = await listTasksForUser({
    userId: user.profile.id,
    status,
    assigneeMode: mode,
    page,
  });

  const groups = groupByDay(items);

  function buildHref(
    overrides: Partial<{ status: string; mode: string; page: number }>,
  ): string {
    const params = new URLSearchParams();
    const nextStatus = overrides.status ?? status ?? '';
    const nextMode = overrides.mode ?? mode;
    const nextPage = overrides.page ?? page;
    if (nextStatus) params.set('status', nextStatus);
    if (nextMode !== 'mine') params.set('mode', nextMode);
    if (nextPage > 1) params.set('page', String(nextPage));
    const s = params.toString();
    return s ? `/tasks?${s}` : '/tasks';
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        {showModeToggle && (
          <div className="inline-flex rounded-md bg-surface-muted p-1 gap-1">
            <ModeTab
              href={buildHref({ mode: 'mine', page: 1 })}
              active={mode === 'mine'}
            >
              Мои
            </ModeTab>
            <ModeTab
              href={buildHref({ mode: 'all', page: 1 })}
              active={mode === 'all'}
            >
              Все
            </ModeTab>
          </div>
        )}

        <TasksFilterSelect
          name="status"
          value={status ?? ''}
          ariaLabel="Статус"
          basePath="/tasks"
          options={[
            { value: '', label: 'Все статусы' },
            ...TASK_STATUSES.map((s) => ({
              value: s,
              label: TASK_STATUS_LABEL[s],
            })),
          ]}
        />

        {status && (
          <Link
            href={buildHref({ status: '', page: 1 })}
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            Сбросить
          </Link>
        )}
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <Link href="/calendar">
            <Calendar size={14} strokeWidth={1.75} />
            Календарь
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState hasFilters={Boolean(status)} mode={mode} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <DayGroup key={g.key} title={g.label} count={g.tasks.length}>
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} canManage={true} showCase />
              ))}
            </DayGroup>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label="Пагинация"
        >
          <p className="text-[12px] text-text-muted">
            Страница {page} из {pageCount} · по {TASKS_PAGE_SIZE} на странице
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
              ← Назад
            </PageLink>
            <PageLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= pageCount}
            >
              Вперёд →
            </PageLink>
          </div>
        </nav>
      )}
    </main>
  );
}

function DayGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle flex items-center gap-2">
        {title}
        <span className="font-mono text-text-muted">· {count}</span>
      </h2>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  );
}

function ModeTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center h-7 px-3 rounded text-[13px] font-medium transition-colors ' +
        (active
          ? 'bg-surface text-text shadow-sm'
          : 'text-text-muted hover:text-text')
      }
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text-subtle bg-surface border border-border rounded-md cursor-not-allowed"
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-surface-muted transition-colors"
    >
      {children}
    </Link>
  );
}

function EmptyState({
  hasFilters,
  mode,
}: {
  hasFilters: boolean;
  mode: 'mine' | 'all';
}) {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <CheckSquare size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">
        {hasFilters ? 'Ничего не нашли' : 'Здесь будут задачи'}
      </h2>
      <p className="text-[13px] text-text-muted max-w-md">
        {hasFilters
          ? 'Попробуйте сбросить фильтры.'
          : mode === 'mine'
            ? 'Задачи, назначенные вам, появятся здесь. Создавайте задачи прямо из карточки дела.'
            : 'По вашим делам пока нет задач.'}
      </p>
    </div>
  );
}

// =====================================================================
// Группировка задач по дням.
//   Просрочено · Без срока · Сегодня · Завтра · На этой неделе · Позже
// =====================================================================
type Group = { key: string; label: string; tasks: TaskWithRefs[] };

function groupByDay(tasks: TaskWithRefs[]): Group[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrow = addDays(todayStart, 2);
  const weekEnd = addDays(todayStart, 7);

  const overdue: TaskWithRefs[] = [];
  const today: TaskWithRefs[] = [];
  const tomorrow: TaskWithRefs[] = [];
  const thisWeek: TaskWithRefs[] = [];
  const later: TaskWithRefs[] = [];
  const noDate: TaskWithRefs[] = [];

  for (const t of tasks) {
    if (!t.due_at) {
      noDate.push(t);
      continue;
    }
    const due = new Date(t.due_at);
    if (t.status === 'open' && due < now) {
      overdue.push(t);
    } else if (due < tomorrowStart) {
      today.push(t);
    } else if (due < dayAfterTomorrow) {
      tomorrow.push(t);
    } else if (due < weekEnd) {
      thisWeek.push(t);
    } else {
      later.push(t);
    }
  }

  const groups: Group[] = [];
  if (overdue.length)
    groups.push({ key: 'overdue', label: 'Просрочено', tasks: overdue });
  if (today.length)
    groups.push({ key: 'today', label: 'Сегодня', tasks: today });
  if (tomorrow.length)
    groups.push({ key: 'tomorrow', label: 'Завтра', tasks: tomorrow });
  if (thisWeek.length)
    groups.push({ key: 'week', label: 'На этой неделе', tasks: thisWeek });
  if (later.length)
    groups.push({ key: 'later', label: 'Позже', tasks: later });
  if (noDate.length)
    groups.push({ key: 'nodate', label: 'Без срока', tasks: noDate });

  return groups;
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
