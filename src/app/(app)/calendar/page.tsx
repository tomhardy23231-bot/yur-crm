import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TaskRow } from '@/components/tasks/task-row';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';
import type { CalendarMessages } from '@/lib/i18n/messages/ru/calendar';
import { listTasksInRange } from '@/lib/tasks/queries';
import { cn } from '@/lib/utils';
import type { TaskKind, TaskWithRefs } from '@/lib/types/db';

const KIND_DOT: Record<TaskKind, string> = {
  task: 'bg-text-muted',
  hearing: 'bg-info',
  deadline: 'bg-warning',
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  await requireUser();
  const { t, plural, locale } = await getT();
  const sp = await searchParams;

  // Длинная дата ("4 червня 2026") — на активном языке.
  const dayFmt = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const weekdayLabels = weekdaysFrom(t.calendar);
  const monthLabels = monthsFrom(t.calendar);

  const today = new Date();
  const { year, monthIdx } = parseMonth(sp.month, today);

  // Grid: 6 недель, начиная с понедельника недели, в которой 1 число месяца.
  const firstOfMonth = new Date(year, monthIdx, 1);
  const gridStart = startOfWeekMonday(firstOfMonth);
  const gridEnd = addDays(gridStart, 42);

  const tasks = await listTasksInRange({
    from: gridStart.toISOString(),
    to: gridEnd.toISOString(),
  });

  // Группируем по локальному дню (YYYY-MM-DD).
  const tasksByDay = new Map<string, TaskWithRefs[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const key = isoDayKey(new Date(t.due_at));
    const arr = tasksByDay.get(key) ?? [];
    arr.push(t);
    tasksByDay.set(key, arr);
  }

  const todayKey = isoDayKey(today);
  const selectedDayKey = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : '';
  const selectedDayTasks = selectedDayKey ? (tasksByDay.get(selectedDayKey) ?? []) : [];
  const selectedDate = selectedDayKey ? new Date(selectedDayKey + 'T00:00:00') : null;

  // Заголовок месяца, ссылки prev/next.
  const monthLabel = `${monthLabels[monthIdx]} ${year}`;
  const prevMonth = toMonthParam(monthIdx === 0 ? year - 1 : year, (monthIdx + 11) % 12);
  const nextMonth = toMonthParam(monthIdx === 11 ? year + 1 : year, (monthIdx + 1) % 12);
  const thisMonthParam = toMonthParam(today.getFullYear(), today.getMonth());

  // Сгенерим клетки.
  const cells: Array<{
    date: Date;
    key: string;
    inMonth: boolean;
    isToday: boolean;
    tasks: TaskWithRefs[];
  }> = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const key = isoDayKey(d);
    cells.push({
      date: d,
      key,
      inMonth: d.getMonth() === monthIdx,
      isToday: key === todayKey,
      tasks: tasksByDay.get(key) ?? [],
    });
  }

  function buildHref(overrides: { month?: string; day?: string | null }): string {
    const params = new URLSearchParams();
    const m = overrides.month ?? sp.month ?? thisMonthParam;
    if (m !== thisMonthParam) params.set('month', m);
    if (overrides.day === undefined) {
      // оставить как было
      if (selectedDayKey) params.set('day', selectedDayKey);
    } else if (overrides.day !== null) {
      params.set('day', overrides.day);
    }
    const s = params.toString();
    return s ? `/calendar?${s}` : '/calendar';
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[24px] leading-[1.2] tracking-[-0.015em] font-semibold text-text capitalize">
          {monthLabel}
        </h1>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tasks">
            <List size={14} strokeWidth={1.75} />
            {t.calendar.listButton}
          </Link>
        </Button>
      </header>

      {/* Навигация месяцами */}
      <div className="flex flex-wrap items-center gap-2">
        <NavLink href={buildHref({ month: prevMonth, day: null })} ariaLabel={t.calendar.prevMonth}>
          <ChevronLeft size={14} strokeWidth={1.75} />
        </NavLink>
        <NavLink href={buildHref({ month: thisMonthParam, day: null })}>
          {t.common.today}
        </NavLink>
        <NavLink href={buildHref({ month: nextMonth, day: null })} ariaLabel={t.calendar.nextMonth}>
          <ChevronRight size={14} strokeWidth={1.75} />
        </NavLink>
        <Legend labels={t.enums.taskKind} />
      </div>

      <Card className="overflow-hidden">
        {/* Headers weekdays */}
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
          {weekdayLabels.map((wd) => (
            <div
              key={wd}
              className="px-2 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle text-center"
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {cells.map((cell) => (
            <DayCell
              key={cell.key}
              date={cell.date}
              tasks={cell.tasks}
              inMonth={cell.inMonth}
              isToday={cell.isToday}
              isSelected={cell.key === selectedDayKey}
              href={buildHref({ day: cell.key })}
            />
          ))}
        </div>
      </Card>

      {selectedDate && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text capitalize">
              {dayFmt.format(selectedDate)}
              <span className="font-mono text-text-muted ml-2">
                · {plural(t.calendar.taskCount, selectedDayTasks.length)}
              </span>
            </h2>
            <Link
              href={buildHref({ day: null })}
              className="text-[12px] text-text-muted hover:text-text underline-offset-2 hover:underline"
            >
              {t.calendar.hide}
            </Link>
          </div>
          {selectedDayTasks.length === 0 ? (
            <Card className="py-10 px-6 text-center">
              <p className="text-[13px] text-text-muted">
                {t.calendar.noTasksDay}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {selectedDayTasks.map((t) => (
                <TaskRow key={t.id} task={t} canManage={true} showCase />
              ))}
            </Card>
          )}
        </section>
      )}

      {tasks.length === 0 && !selectedDate && (
        <div className="flex items-center gap-2 text-[13px] text-text-muted">
          <CalendarDays size={14} strokeWidth={1.75} />
          {t.calendar.noTasksMonth}
        </div>
      )}
    </main>
  );
}

function DayCell({
  date,
  tasks,
  inMonth,
  isToday,
  isSelected,
  href,
}: {
  date: Date;
  tasks: TaskWithRefs[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  href: string;
}) {
  const dayNum = date.getDate();
  const visible = tasks.slice(0, 3);
  const extra = tasks.length - visible.length;

  return (
    <Link
      href={href}
      className={cn(
        'relative min-h-[88px] p-2 border-r border-b border-border last:border-r-0',
        'flex flex-col gap-1.5 transition-colors duration-[120ms] ease-out',
        inMonth ? 'bg-surface text-text' : 'bg-surface-muted/40 text-text-subtle',
        isSelected
          ? '!bg-primary-subtle'
          : 'hover:bg-surface-muted/60',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-mono font-semibold',
          isToday
            ? 'bg-primary text-primary-fg'
            : inMonth
              ? 'text-text'
              : 'text-text-subtle',
        )}
      >
        {dayNum}
      </span>

      {visible.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {visible.map((t) => (
            <li
              key={t.id}
              className={cn(
                'flex items-center gap-1 text-[11px] leading-tight truncate',
                t.status === 'done' && 'opacity-50 line-through',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  KIND_DOT[t.kind],
                )}
                aria-hidden="true"
              />
              <span className="truncate text-text">{t.title}</span>
            </li>
          ))}
          {extra > 0 && (
            <li className="text-[10.5px] font-mono text-text-muted pl-2.5">
              +{extra}
            </li>
          )}
        </ul>
      )}
    </Link>
  );
}

function NavLink({
  href,
  ariaLabel,
  children,
}: {
  href: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-surface-muted transition-colors"
    >
      {children}
    </Link>
  );
}

function Legend({ labels }: { labels: Record<TaskKind, string> }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
      <LegendItem dotClass={KIND_DOT.task} label={labels.task} />
      <LegendItem dotClass={KIND_DOT.hearing} label={labels.hearing} />
      <LegendItem dotClass={KIND_DOT.deadline} label={labels.deadline} />
    </div>
  );
}

function LegendItem({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', dotClass)} aria-hidden="true" />
      {label}
    </span>
  );
}

// =====================================================================
// helpers
// =====================================================================

function parseMonth(
  raw: string | undefined,
  fallback: Date,
): { year: number; monthIdx: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) {
      return { year: y, monthIdx: m - 1 };
    }
  }
  return { year: fallback.getFullYear(), monthIdx: fallback.getMonth() };
}

function toMonthParam(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

function startOfWeekMonday(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  // JS: вс=0, пн=1, ..., сб=6. Хотим пн как старт.
  const wd = n.getDay();
  const back = wd === 0 ? 6 : wd - 1;
  n.setDate(n.getDate() - back);
  return n;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Пн…Вс из словаря в порядке отображения сетки (неделя с понедельника).
function weekdaysFrom(c: CalendarMessages): string[] {
  const w = c.weekdays;
  return [w.mon, w.tue, w.wed, w.thu, w.fri, w.sat, w.sun];
}

// Месяцы из словаря по индексу (0 = январь … 11 = декабрь).
function monthsFrom(c: CalendarMessages): string[] {
  const m = c.months;
  return [
    m.january,
    m.february,
    m.march,
    m.april,
    m.may,
    m.june,
    m.july,
    m.august,
    m.september,
    m.october,
    m.november,
    m.december,
  ];
}
