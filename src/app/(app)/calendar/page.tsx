import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { AgendaBlock } from '@/components/calendar/agenda-block';
import { WeekGrid, type WeekDayCell } from '@/components/calendar/week-grid';
import { NewTaskButton } from '@/components/tasks/new-task-button';
import { TaskRow } from '@/components/tasks/task-row';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';
import {
  addDays,
  isoDayKey,
  monthsFrom,
  parseMonth,
  parseWeekStart,
  startOfWeekMonday,
  toMonthParam,
  weekdaysFrom,
} from '@/lib/calendar/dates';
import { listCasesForSelect } from '@/lib/cases/queries';
import { listAssignableUsers, listTasksInRange } from '@/lib/tasks/queries';
import { listAbsencesInRange } from '@/lib/absences/queries';
import { cn } from '@/lib/utils';
import type { TaskKind, TaskWithRefs, AbsenceWithUser } from '@/lib/types/db';

// Цвета типов (каркас 2026-07-13): задача — синий, заседание (суд) — красный,
// срок — янтарь. Точка — ярким тоном, чип — «подложка + тёмный текст».
const KIND_DOT: Record<TaskKind, string> = {
  task: 'bg-primary',
  hearing: 'bg-error',
  deadline: 'bg-warning',
};

const KIND_CHIP: Record<TaskKind, string> = {
  task: 'bg-primary-subtle text-primary-pressed',
  hearing: 'bg-error-bg text-error-text',
  deadline: 'bg-warning-bg text-warning-text',
};

// Отсутствия (отпуска/больничные) — единый violet-маркер (--absence), отличимый
// от видов задач. Тип отсутствия раскрывается в панели дня (v2 Этап 6).
const ABSENCE_DOT = 'bg-absence';
const ABSENCE_CHIP = 'bg-absence-bg text-absence';

type CalendarView = 'month' | 'week';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; view?: string; week?: string }>;
}) {
  const user = await requireUser();
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
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const view: CalendarView = sp.view === 'week' ? 'week' : 'month';
  const { year, monthIdx } = parseMonth(sp.month, today);

  // Границы видимого диапазона: месяц — сетка 6 недель, неделя — 7 дней.
  const firstOfMonth = new Date(year, monthIdx, 1);
  const gridStart = startOfWeekMonday(firstOfMonth);
  const gridEnd = addDays(gridStart, 42); // exclusive
  const weekStart = parseWeekStart(sp.week, today);
  const weekEnd = addDays(weekStart, 7); // exclusive

  const rangeStart = view === 'week' ? weekStart : gridStart;
  const rangeEnd = view === 'week' ? weekEnd : gridEnd;

  // Повестка «Сегодня» должна работать и когда листаешь другой месяц/неделю —
  // расширяем диапазон выборки до сегодняшнего дня включительно.
  const tomorrowStart = addDays(todayStart, 1);
  const fetchStart = rangeStart <= todayStart ? rangeStart : todayStart;
  const fetchEnd = rangeEnd >= tomorrowStart ? rangeEnd : tomorrowStart;

  // Последний день выборки (включительно) — для overlap-выборки отсутствий.
  // 6.1: справочники модалки «+ Задача» (исполнители + видимые дела) — тем же батчем.
  const fetchLastKey = isoDayKey(addDays(fetchEnd, -1));
  const [tasks, absences, assignees, casesForSelect] = await Promise.all([
    listTasksInRange({ from: fetchStart.toISOString(), to: fetchEnd.toISOString() }),
    listAbsencesInRange({ from: isoDayKey(fetchStart), to: fetchLastKey }),
    listAssignableUsers(),
    listCasesForSelect(),
  ]);

  // Группируем задачи по локальному дню (YYYY-MM-DD).
  const tasksByDay = new Map<string, TaskWithRefs[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const key = isoDayKey(new Date(t.due_at));
    const arr = tasksByDay.get(key) ?? [];
    arr.push(t);
    tasksByDay.set(key, arr);
  }

  // Отсутствия охватывают диапазон дат — раскрываем их в каждый покрытый день сетки.
  const absencesOnDay = (key: string): AbsenceWithUser[] =>
    absences.filter((a) => key >= a.starts_on && key <= a.ends_on);

  const todayKey = isoDayKey(today);
  const selectedDayKey = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : '';
  const selectedDayTasks = selectedDayKey ? (tasksByDay.get(selectedDayKey) ?? []) : [];
  const selectedDayAbsences = selectedDayKey ? absencesOnDay(selectedDayKey) : [];
  const selectedDate = selectedDayKey ? new Date(selectedDayKey + 'T00:00:00') : null;

  // Заголовок: месяц («липень 2026») или диапазон недели («7–13 липня 2026»).
  const monthLabel = `${monthLabels[monthIdx]} ${year}`;
  const weekLabel = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatRange(weekStart, addDays(weekEnd, -1));
  const prevMonth = toMonthParam(monthIdx === 0 ? year - 1 : year, (monthIdx + 11) % 12);
  const nextMonth = toMonthParam(monthIdx === 11 ? year + 1 : year, (monthIdx + 1) % 12);
  const thisMonthParam = toMonthParam(today.getFullYear(), today.getMonth());
  const thisWeekParam = isoDayKey(startOfWeekMonday(today));
  const weekParam = isoDayKey(weekStart);

  // Сгенерим клетки месячной сетки.
  const cells: Array<{
    date: Date;
    key: string;
    inMonth: boolean;
    isToday: boolean;
    tasks: TaskWithRefs[];
    absences: AbsenceWithUser[];
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
      absences: absencesOnDay(key),
    });
  }

  function buildHref(overrides: {
    month?: string;
    day?: string | null;
    view?: CalendarView;
    week?: string;
  }): string {
    const params = new URLSearchParams();
    const nextView = overrides.view ?? view;
    if (nextView === 'week') {
      params.set('view', 'week');
      const w = overrides.week ?? weekParam;
      if (w !== thisWeekParam) params.set('week', w);
    } else {
      const m = overrides.month ?? sp.month ?? thisMonthParam;
      if (m !== thisMonthParam) params.set('month', m);
    }
    if (overrides.day === undefined) {
      // оставить как было
      if (selectedDayKey) params.set('day', selectedDayKey);
    } else if (overrides.day !== null) {
      params.set('day', overrides.day);
    }
    const s = params.toString();
    return s ? `/calendar?${s}` : '/calendar';
  }

  // Переключение вида: месяц ← середина активной недели; неделя ← сегодняшняя,
  // если открыт текущий месяц, иначе неделя 1-го числа месяца.
  const monthOfWeek = toMonthParam(
    addDays(weekStart, 3).getFullYear(),
    addDays(weekStart, 3).getMonth(),
  );
  const weekOfMonth =
    toMonthParam(year, monthIdx) === thisMonthParam
      ? thisWeekParam
      : isoDayKey(startOfWeekMonday(firstOfMonth));

  // Клетки недельного вида.
  const weekDays: WeekDayCell[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = isoDayKey(d);
    return {
      date: d,
      key,
      isToday: key === todayKey,
      isSelected: key === selectedDayKey,
      href: buildHref({ day: key }),
      tasks: tasksByDay.get(key) ?? [],
      absences: absencesOnDay(key),
    };
  });

  // Пусто ли в видимом диапазоне (для EmptyState под сеткой).
  const rangeEmpty =
    view === 'week'
      ? weekDays.every((d) => d.tasks.length === 0 && d.absences.length === 0)
      : cells.every((c) => c.tasks.length === 0 && c.absences.length === 0);

  // Повестка «Сегодня» — задачи и отсутствия сегодняшнего дня (все видимые).
  const agendaTasks = tasksByDay.get(todayKey) ?? [];
  const agendaAbsences = absencesOnDay(todayKey);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[24px] leading-[1.2] tracking-[-0.015em] font-semibold text-text capitalize">
          {view === 'week' ? weekLabel : monthLabel}
        </h1>
        <Button asChild variant="secondary" size="sm">
          <Link href="/tasks">
            <List size={14} strokeWidth={1.75} />
            {t.calendar.listButton}
          </Link>
        </Button>
      </header>

      {/* Навигация: назад/сегодня/вперёд + переключатель Месяц|Неделя + легенда */}
      <div className="flex flex-wrap items-center gap-2">
        {view === 'week' ? (
          <>
            <NavLink
              href={buildHref({ week: isoDayKey(addDays(weekStart, -7)), day: null })}
              ariaLabel={t.calendar.prevWeek}
            >
              <ChevronLeft size={14} strokeWidth={1.75} />
            </NavLink>
            <NavLink href={buildHref({ week: thisWeekParam, day: null })}>
              {t.common.today}
            </NavLink>
            <NavLink
              href={buildHref({ week: isoDayKey(addDays(weekStart, 7)), day: null })}
              ariaLabel={t.calendar.nextWeek}
            >
              <ChevronRight size={14} strokeWidth={1.75} />
            </NavLink>
          </>
        ) : (
          <>
            <NavLink href={buildHref({ month: prevMonth, day: null })} ariaLabel={t.calendar.prevMonth}>
              <ChevronLeft size={14} strokeWidth={1.75} />
            </NavLink>
            <NavLink href={buildHref({ month: thisMonthParam, day: null })}>
              {t.common.today}
            </NavLink>
            <NavLink href={buildHref({ month: nextMonth, day: null })} ariaLabel={t.calendar.nextMonth}>
              <ChevronRight size={14} strokeWidth={1.75} />
            </NavLink>
          </>
        )}

        {/* Переключатель вида — сегмент-контрол каркаса (синий тинт актива). */}
        <div
          role="tablist"
          aria-label={t.calendar.viewAria}
          className="ml-1 flex items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5"
        >
          {[
            { key: 'month' as const, label: t.calendar.viewMonth, href: buildHref({ view: 'month', month: monthOfWeek, day: null }) },
            { key: 'week' as const, label: t.calendar.viewWeek, href: buildHref({ view: 'week', week: weekOfMonth, day: null }) },
          ].map((tab) => {
            const active = tab.key === view;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={active}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-all',
                  active
                    ? 'bg-primary-subtle text-primary-pressed'
                    : 'text-text-subtle hover:text-text',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <Legend labels={t.enums.taskKind} absenceLabel={t.absences.calendar.legend} />
      </div>

      {/* Повестка дня: события сегодня (пустая — не рендерится). */}
      <AgendaBlock tasks={agendaTasks} absences={agendaAbsences} />

      {view === 'week' ? (
        <WeekGrid days={weekDays} weekdayLabels={weekdayLabels} />
      ) : (
        <Card className="p-2 sm:p-4">
          {/* Заголовки дней недели: выходные — красным (каркас). */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekdayLabels.map((wd, i) => (
              <div
                key={wd}
                className={cn(
                  'pb-2 text-center text-[11.5px] font-semibold uppercase tracking-wide',
                  i >= 5 ? 'text-error' : 'text-text-subtle',
                )}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Сетка плиток-дней (каркас): скруглённые ячейки с зазором. */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {cells.map((cell) => (
              <DayCell
                key={cell.key}
                date={cell.date}
                tasks={cell.tasks}
                absences={cell.absences}
                inMonth={cell.inMonth}
                isToday={cell.isToday}
                isSelected={cell.key === selectedDayKey}
                href={buildHref({ day: cell.key })}
              />
            ))}
          </div>
        </Card>
      )}

      {selectedDate && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-text capitalize">
              {dayFmt.format(selectedDate)}
              <span className="text-text-muted ml-2">
                · {plural(t.calendar.taskCount, selectedDayTasks.length)}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {/* 6.1: задача на выбранный день (срок предзаполнен, 09:00). */}
              <NewTaskButton
                assignees={assignees}
                cases={casesForSelect}
                currentUserId={user.profile.id}
                label={t.calendar.addTask}
                defaultDueAt={`${selectedDayKey}T09:00`}
                variant="secondary"
              />
              <Link
                href={buildHref({ day: null })}
                className="text-[12px] text-text-muted hover:text-text underline-offset-2 hover:underline"
              >
                {t.calendar.hide}
              </Link>
            </div>
          </div>
          {selectedDayTasks.length === 0 && selectedDayAbsences.length === 0 ? (
            <Card className="py-10 px-6 text-center">
              <p className="text-[13px] text-text-muted">
                {t.calendar.noTasksDay}
              </p>
            </Card>
          ) : (
            <>
              {selectedDayTasks.length > 0 && (
                <Card className="overflow-hidden">
                  {selectedDayTasks.map((t) => (
                    <TaskRow key={t.id} task={t} canManage={true} showCase />
                  ))}
                </Card>
              )}
              {selectedDayAbsences.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-[12px] text-text-muted">
                    {t.absences.calendar.dayHeading}
                  </h3>
                  <Card className="divide-y divide-border overflow-hidden">
                    {selectedDayAbsences.map((a) => (
                      <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', ABSENCE_DOT)} aria-hidden="true" />
                        <span className="text-[13.5px] font-medium text-text">
                          {a.user?.full_name ?? '—'}
                        </span>
                        <span className="text-[12.5px] text-text-muted">
                          · {t.enums.absenceKind[a.kind]}
                        </span>
                      </div>
                    ))}
                  </Card>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Пустой месяц/неделя: единый EmptyState с CTA «Задача» (v4 полировка). */}
      {rangeEmpty && !selectedDate && (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={view === 'week' ? t.calendar.weekEmptyTitle : t.calendar.monthEmptyTitle}
            hint={view === 'week' ? t.calendar.weekEmptyHint : t.calendar.monthEmptyHint}
            action={
              <NewTaskButton
                assignees={assignees}
                cases={casesForSelect}
                currentUserId={user.profile.id}
                label={t.calendar.addTask}
              />
            }
          />
        </Card>
      )}
    </main>
  );
}

function DayCell({
  date,
  tasks,
  absences,
  inMonth,
  isToday,
  isSelected,
  href,
}: {
  date: Date;
  tasks: TaskWithRefs[];
  absences: AbsenceWithUser[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  href: string;
}) {
  const dayNum = date.getDate();
  const shownAbs = absences.slice(0, 2);
  const shownTasks = tasks.slice(0, 3);
  // Переполнение списка ≥sm — суммарно по обоим типам.
  const extra =
    (absences.length - shownAbs.length) + (tasks.length - shownTasks.length);
  const hasItems = tasks.length > 0 || absences.length > 0;

  return (
    <Link
      href={href}
      className={cn(
        // Плитка дня (каркас 2026-07-13): скруглённая ячейка с бордером.
        'relative min-h-[58px] rounded-lg border p-1 sm:min-h-[92px] sm:rounded-xl sm:p-2',
        'flex flex-col gap-1 sm:gap-1.5 transition-all duration-[150ms] ease-out',
        !inMonth && 'border-border/50 bg-surface-sunken/40 opacity-55',
        inMonth &&
          !isToday &&
          'border-border bg-surface hover:border-primary-border hover:bg-primary-softer',
        isToday && 'border-primary bg-primary-subtle',
        isSelected && 'ring-2 ring-primary/40',
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            'font-mono text-[12px] font-semibold tabular-nums leading-6',
            !inMonth && 'text-text-subtle',
            inMonth && !isToday && 'text-text-muted',
            isToday && 'font-bold text-primary-pressed',
          )}
        >
          {dayNum}
        </span>
        {isToday && (
          <span className="rounded-full bg-primary px-1.5 py-px text-[8.5px] font-bold uppercase leading-tight text-white">
            •
          </span>
        )}
      </span>

      {hasItems && (
        <>
          {/* Мобильные: ряд точек — сначала отсутствия (violet), затем задачи. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1 sm:hidden">
            {absences.slice(0, 2).map((a) => (
              <span
                key={a.id}
                className={cn('h-1.5 w-1.5 rounded-full', ABSENCE_DOT)}
                aria-hidden="true"
              />
            ))}
            {tasks.slice(0, 4).map((t) => (
              <span
                key={t.id}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  KIND_DOT[t.kind],
                  t.status === 'done' && 'opacity-40',
                )}
                aria-hidden="true"
              />
            ))}
            {(tasks.length > 4 || absences.length > 2) && (
              <span className="text-[9px] font-semibold leading-none text-text-muted">
                +{Math.max(0, tasks.length - 4) + Math.max(0, absences.length - 2)}
              </span>
            )}
          </div>

          {/* ≥ sm: чипы событий цветом типа (каркас): отсутствия + задачи. */}
          <ul className="hidden flex-col gap-0.5 overflow-hidden sm:flex">
            {shownAbs.map((a) => (
              <li key={a.id}>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight',
                    ABSENCE_CHIP,
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ABSENCE_DOT)}
                    aria-hidden="true"
                  />
                  <span className="truncate">{a.user?.full_name ?? '—'}</span>
                </span>
              </li>
            ))}
            {shownTasks.map((t) => (
              <li key={t.id}>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight',
                    KIND_CHIP[t.kind],
                    t.status === 'done' && 'opacity-50 line-through',
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', KIND_DOT[t.kind])}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t.title}</span>
                </span>
              </li>
            ))}
            {extra > 0 && (
              <li className="px-1 text-[10px] font-semibold text-text-subtle">
                +{extra}
              </li>
            )}
          </ul>
        </>
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
      className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 text-[13px] font-medium text-text transition-all hover:border-primary-border hover:bg-primary-softer"
    >
      {children}
    </Link>
  );
}

function Legend({ labels, absenceLabel }: { labels: Record<TaskKind, string>; absenceLabel: string }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
      <LegendItem dotClass={KIND_DOT.task} label={labels.task} />
      <LegendItem dotClass={KIND_DOT.hearing} label={labels.hearing} />
      <LegendItem dotClass={KIND_DOT.deadline} label={labels.deadline} />
      <LegendItem dotClass={ABSENCE_DOT} label={absenceLabel} />
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
