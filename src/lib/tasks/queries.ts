import 'server-only';
import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kyivToday } from '@/lib/payroll/month';
import type {
  Task,
  TaskKind,
  TaskStatus,
  TaskWithRefs,
} from '@/lib/types/db';

export const TASKS_PAGE_SIZE = 30;

// =====================================================================
// listTasksByCase — список задач на карточке дела.
// Сортировка: open впереди, потом по due_at asc (nulls last).
// =====================================================================
export const listTasksByCase = cache(async (caseId: string): Promise<TaskWithRefs[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
        'assignee:assignee_id(id, full_name), case:case_id(id, number_title)',
    )
    .eq('case_id', caseId)
    // status asc → open(< done в алфавите? нет: 'done' < 'open'). Сортируем явно.
    .order('status', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`listTasksByCase failed: ${error.message}`);
  }
  return normalizeTasks(data ?? []);
});

// =====================================================================
// listTasksForUser — общая страница /tasks.
// assigneeMode='mine' — только assigned к userId.
// assigneeMode='all'  — все видимые (RLS уже отрезала чужие дела).
// =====================================================================
export type ListTasksForUserParams = {
  userId: string;
  status?: TaskStatus;
  assigneeMode?: 'mine' | 'all';
  page?: number;
};

export type ListTasksForUserResult = {
  items: TaskWithRefs[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listTasksForUser(
  params: ListTasksForUserParams,
): Promise<ListTasksForUserResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * TASKS_PAGE_SIZE;

  let query = supabase
    .from('tasks')
    .select(
      'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
        'assignee:assignee_id(id, full_name), case:case_id(id, number_title)',
      { count: 'exact' },
    )
    .order('status', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false })
    .range(offset, offset + TASKS_PAGE_SIZE - 1);

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if ((params.assigneeMode ?? 'mine') === 'mine') {
    query = query.eq('assignee_id', params.userId);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`listTasksForUser failed: ${error.message}`);
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE));
  return {
    items: normalizeTasks(data ?? []),
    total,
    page,
    pageSize: TASKS_PAGE_SIZE,
    pageCount,
  };
}

// =====================================================================
// listTasksInRange — /calendar.
// Возвращает все видимые задачи c due_at в полуоткрытом [from, to).
// =====================================================================
export async function listTasksInRange(params: {
  from: string;
  to: string;
}): Promise<TaskWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
        'assignee:assignee_id(id, full_name), case:case_id(id, number_title)',
    )
    .not('due_at', 'is', null)
    .gte('due_at', params.from)
    .lt('due_at', params.to)
    .order('due_at', { ascending: true });

  if (error) {
    throw new Error(`listTasksInRange failed: ${error.message}`);
  }
  return normalizeTasks(data ?? []);
}

// =====================================================================
// countOpenTasksAssignedTo — счётчик для sidebar.
// =====================================================================
export async function countOpenTasksAssignedTo(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', userId)
    .eq('status', 'open');

  if (error) {
    throw new Error(`countOpenTasksAssignedTo failed: ${error.message}`);
  }
  return count ?? 0;
}

// =====================================================================
// countUserTasksDue — честный колокольчик топбара (v3 Сессия 6).
// Два дешёвых head-count по открытым задачам пользователя:
//   • overdue — просроченные (due_at < now);
//   • today   — сегодняшние по Киеву (now ≤ due_at < конец киевского дня).
// =====================================================================

// Текущее смещение Киева ('+02:00'/'+03:00') из Intl longOffset: в сам день
// перевода часов (DST в 03:00) границы уедут на ±1 час — для счётчиков и
// блока «Мой день» несущественно.
function kyivOffset(): string {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value;
  return /GMT([+-]\d{2}:\d{2})/.exec(tzName ?? '')?.[1] ?? '+02:00';
}

// Начало СЕГОДНЯШНЕГО дня Киева как UTC-instant (ISO) — для среза «Мой день».
function kyivTodayStartIso(): string {
  return new Date(`${kyivToday()}T00:00:00${kyivOffset()}`).toISOString();
}

// Конец СЕГОДНЯШНЕГО дня Киева как UTC-instant (ISO).
function kyivTodayEndIso(): string {
  // Полночь СЛЕДУЮЩЕГО киевского дня в киевском смещении = конец сегодняшнего.
  const [y, m, d] = kyivToday().split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return new Date(`${next}T00:00:00${kyivOffset()}`).toISOString();
}

export type UserTasksDue = { overdue: number; today: number };

export async function countUserTasksDue(userId: string): Promise<UserTasksDue> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const dayEndIso = kyivTodayEndIso();

  const [overdueRes, todayRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .eq('status', 'open')
      .not('due_at', 'is', null)
      .lt('due_at', nowIso),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .eq('status', 'open')
      .gte('due_at', nowIso)
      .lt('due_at', dayEndIso),
  ]);

  if (overdueRes.error) {
    throw new Error(`countUserTasksDue overdue failed: ${overdueRes.error.message}`);
  }
  if (todayRes.error) {
    throw new Error(`countUserTasksDue today failed: ${todayRes.error.message}`);
  }
  return { overdue: overdueRes.count ?? 0, today: todayRes.count ?? 0 };
}

// =====================================================================
// listUpcomingTasks — приближающиеся сроки (Шаг 10, напоминания).
// RLS отрежет невидимые: specialist видит только свои дела;
// admin — все. Поэтому мы НЕ фильтруем по assignee — admin'у полезно видеть
// приближающиеся дедлайны всей команды.
//
// v3 Сессия 4: разделяем на ДВЕ группы, чтобы просрочки не тонули среди
// будущих дедлайнов:
//   • overdue — просроченные (due_at < now): топ-N свежих (due_at desc) + общий
//     счётчик (overdueCount), чтобы показать «Просроченные (N)»;
//   • soon — ближайшие hoursAhead часов (now ≤ due_at < now+window), asc.
// Возвращает только open-task с непустым due_at.
// Параметры:
//   - hoursAhead: окно будущего (по умолчанию 72ч ≈ «ближайшие 3 дня»);
//   - limit: сколько ближайших (soon) показать;
//   - overdueLimit: сколько просрочек показать (по умолчанию 3).
// =====================================================================
export type UpcomingTasks = {
  overdue: TaskWithRefs[];
  overdueCount: number;
  soon: TaskWithRefs[];
  /** «Мой день» (v3 s11): открытые задачи todayForUserId с due в сегодняшнем
   *  киевском дне (включая уже просроченные сегодня). Пуст без параметра. */
  today: TaskWithRefs[];
};

export async function listUpcomingTasks(params: {
  hoursAhead?: number;
  limit?: number;
  overdueLimit?: number;
  /** Если задан — третьим лёгким запросом срез «сегодня» этого пользователя. */
  todayForUserId?: string;
} = {}): Promise<UpcomingTasks> {
  const hoursAhead = params.hoursAhead ?? 72;
  const limit = Math.max(1, params.limit ?? 10);
  const overdueLimit = Math.max(1, params.overdueLimit ?? 3);

  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + hoursAhead * 3600 * 1000,
  ).toISOString();

  const select =
    'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
    'assignee:assignee_id(id, full_name), case:case_id(id, number_title)';

  const supabase = await createSupabaseServerClient();

  const [overdueRes, soonRes, todayRes] = await Promise.all([
    // Просроченные: самые свежие сверху (due_at desc) + точный общий счётчик.
    supabase
      .from('tasks')
      .select(select, { count: 'exact' })
      .eq('status', 'open')
      .not('due_at', 'is', null)
      .lt('due_at', nowIso)
      .order('due_at', { ascending: false })
      .limit(overdueLimit),
    // Ближайшие: окно [now, now+hoursAhead), по возрастанию срока.
    supabase
      .from('tasks')
      .select(select)
      .eq('status', 'open')
      .not('due_at', 'is', null)
      .gte('due_at', nowIso)
      .lt('due_at', horizonIso)
      .order('due_at', { ascending: true })
      .limit(limit),
    // «Мой день»: сегодняшний киевский день целиком, только свои задачи.
    params.todayForUserId
      ? supabase
          .from('tasks')
          .select(select)
          .eq('status', 'open')
          .eq('assignee_id', params.todayForUserId)
          .gte('due_at', kyivTodayStartIso())
          .lt('due_at', kyivTodayEndIso())
          .order('due_at', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (overdueRes.error) {
    throw new Error(`listUpcomingTasks overdue failed: ${overdueRes.error.message}`);
  }
  if (soonRes.error) {
    throw new Error(`listUpcomingTasks soon failed: ${soonRes.error.message}`);
  }
  if (todayRes.error) {
    throw new Error(`listUpcomingTasks today failed: ${todayRes.error.message}`);
  }

  return {
    overdue: normalizeTasks(overdueRes.data ?? []),
    overdueCount: overdueRes.count ?? 0,
    soon: normalizeTasks(soonRes.data ?? []),
    today: normalizeTasks(todayRes.data ?? []),
  };
}

// =====================================================================
// listAssignableUsers — для Select assignee при создании/редактировании задачи.
// Любой active user (CLAUDE.md §7-5: специалист может ставить себе И коллегам).
// =====================================================================
export type AssigneeOption = {
  id: string;
  full_name: string;
  role: string;
};

export async function listAssignableUsers(): Promise<AssigneeOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`listAssignableUsers failed: ${error.message}`);
  }
  return (data ?? []) as AssigneeOption[];
}

// =====================================================================
// getTask — одна задача с join-ами (для /tasks/[id]/edit, если понадобится).
// =====================================================================
export async function getTask(id: string): Promise<TaskWithRefs | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
        'assignee:assignee_id(id, full_name), case:case_id(id, number_title)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`getTask failed: ${error.message}`);
  }
  if (!data) return null;
  return normalizeTasks([data])[0] ?? null;
}

// =====================================================================
// helpers
// =====================================================================

type RawTaskRow = Omit<Task, 'kind' | 'status'> & {
  kind: TaskKind;
  status: TaskStatus;
  assignee:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
  case:
    | ReadonlyArray<{ id: string; number_title: string }>
    | { id: string; number_title: string }
    | null;
};

function normalizeTasks(rows: ReadonlyArray<unknown>): TaskWithRefs[] {
  return rows.map((row) => {
    const r = row as RawTaskRow;
    const assignee = Array.isArray(r.assignee)
      ? (r.assignee[0] ?? null)
      : r.assignee;
    const caseRef = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
    return {
      id: r.id,
      case_id: r.case_id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      assignee_id: r.assignee_id,
      created_by: r.created_by,
      due_at: r.due_at,
      status: r.status,
      created_at: r.created_at,
      assignee,
      case: caseRef,
    };
  });
}
