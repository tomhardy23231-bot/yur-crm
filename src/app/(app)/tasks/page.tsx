import Link from 'next/link';
import { Calendar, CheckSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { NewTaskButton } from '@/components/tasks/new-task-button';
import { TaskRow } from '@/components/tasks/task-row';
import { TasksFilterSelect } from '@/components/tasks/tasks-filter-select';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { listCasesForSelect } from '@/lib/cases/queries';
import {
  listAssignableUsers,
  listTasksForUser,
  TASKS_PAGE_SIZE,
} from '@/lib/tasks/queries';
import {
  STAFF_ROLES,
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
  const { t, fmt } = await getT();
  const sp = await searchParams;

  const status = sp.status && isTaskStatus(sp.status) ? sp.status : undefined;
  const mode: 'mine' | 'all' = sp.mode === 'all' ? 'all' : 'mine';
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // Для не-staff режим 'all' покажет только видимые им задачи (через RLS),
  // что = их же задачам. Поэтому не показываем переключатель.
  const showModeToggle = isStaff;

  // 6.1: справочники модалки «Новая задача» (исполнители + видимые дела) —
  // независимы от списка, грузим одним батчем.
  const [{ items, pageCount }, assignees, casesForSelect] = await Promise.all([
    listTasksForUser({
      userId: user.profile.id,
      status,
      assigneeMode: mode,
      page,
    }),
    listAssignableUsers(),
    listCasesForSelect(),
  ]);

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
          <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 gap-0.5">
            <ModeTab
              href={buildHref({ mode: 'mine', page: 1 })}
              active={mode === 'mine'}
            >
              {t.tasks.page.modeMine}
            </ModeTab>
            <ModeTab
              href={buildHref({ mode: 'all', page: 1 })}
              active={mode === 'all'}
            >
              {t.tasks.page.modeAll}
            </ModeTab>
          </div>
        )}

        <TasksFilterSelect
          name="status"
          value={status ?? ''}
          ariaLabel={t.tasks.page.statusAria}
          basePath="/tasks"
          options={[
            { value: '', label: t.tasks.page.allStatuses },
            ...TASK_STATUSES.map((s) => ({
              value: s,
              label: t.enums.taskStatus[s],
            })),
          ]}
        />

        {status && (
          <Link
            href={buildHref({ status: '', page: 1 })}
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            {t.tasks.page.reset}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/calendar">
              <Calendar size={14} strokeWidth={1.75} />
              {t.tasks.page.calendar}
            </Link>
          </Button>
          <NewTaskButton
            assignees={assignees}
            cases={casesForSelect}
            currentUserId={user.profile.id}
            label={t.tasks.page.newTask}
            openOnNewParam
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-8 shadow-sm">
          <EmptyState
            icon={CheckSquare}
            title={
              status ? t.tasks.page.emptyFilteredTitle : t.tasks.page.emptyTitle
            }
            hint={
              status
                ? t.tasks.page.emptyFilteredText
                : mode === 'mine'
                  ? t.tasks.page.emptyMineText
                  : t.tasks.page.emptyAllText
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <DayGroup
              key={g.key}
              title={t.tasks.page[g.labelKey]}
              count={g.tasks.length}
            >
              {g.tasks.map((task) => (
                <TaskRow key={task.id} task={task} canManage={true} showCase />
              ))}
            </DayGroup>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label={t.tasks.page.paginationAria}
        >
          <p className="text-[12px] text-text-muted">
            {fmt(t.tasks.page.pageInfo, {
              page,
              pageCount,
              pageSize: TASKS_PAGE_SIZE,
            })}
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
              {t.tasks.page.prev}
            </PageLink>
            <PageLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= pageCount}
            >
              {t.tasks.page.next}
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
  // Каркас 2026-07-13: секция дня — карточка с шапкой на sunken-подложке
  // и счётчиком-пилюлей.
  return (
    <Card>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-sunken/40 px-4 py-2.5">
        <h2 className="text-[12.5px] font-semibold text-text">{title}</h2>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-muted">
          {count}
        </span>
      </header>
      {children}
    </Card>
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
  // Сегмент-контрол каркаса: активный пункт — синий тинт.
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-all ' +
        (active
          ? 'bg-primary-subtle text-primary-pressed'
          : 'text-text-subtle hover:text-text')
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
      className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-primary-softer transition-colors"
    >
      {children}
    </Link>
  );
}

// =====================================================================
// Группировка задач по дням.
//   Просрочено · Без срока · Сегодня · Завтра · На этой неделе · Позже
// =====================================================================
type GroupLabelKey =
  | 'groupOverdue'
  | 'groupToday'
  | 'groupTomorrow'
  | 'groupWeek'
  | 'groupLater'
  | 'groupNoDate';

type Group = { key: string; labelKey: GroupLabelKey; tasks: TaskWithRefs[] };

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
    groups.push({ key: 'overdue', labelKey: 'groupOverdue', tasks: overdue });
  if (today.length)
    groups.push({ key: 'today', labelKey: 'groupToday', tasks: today });
  if (tomorrow.length)
    groups.push({ key: 'tomorrow', labelKey: 'groupTomorrow', tasks: tomorrow });
  if (thisWeek.length)
    groups.push({ key: 'week', labelKey: 'groupWeek', tasks: thisWeek });
  if (later.length)
    groups.push({ key: 'later', labelKey: 'groupLater', tasks: later });
  if (noDate.length)
    groups.push({ key: 'nodate', labelKey: 'groupNoDate', tasks: noDate });

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
