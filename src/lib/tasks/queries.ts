import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
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
export async function listTasksByCase(caseId: string): Promise<TaskWithRefs[]> {
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
}

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
// listUpcomingTasks — приближающиеся сроки (Шаг 10, напоминания).
// RLS отрежет невидимые: specialist видит только свои дела;
// admin — все. Поэтому мы НЕ фильтруем по assignee — admin'у полезно видеть
// приближающиеся дедлайны всей команды.
// Параметры:
//   - hoursAhead: окно (по умолчанию 72ч ≈ «ближайшие 3 дня»);
//   - limit: сколько ближайших показать.
// Возвращает только open-task с непустым due_at, отсортированные asc.
// =====================================================================
export async function listUpcomingTasks(params: {
  hoursAhead?: number;
  limit?: number;
} = {}): Promise<TaskWithRefs[]> {
  const hoursAhead = params.hoursAhead ?? 72;
  const limit = Math.max(1, params.limit ?? 10);

  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 3600 * 1000);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, case_id, title, description, kind, assignee_id, created_by, due_at, status, created_at, ' +
        'assignee:assignee_id(id, full_name), case:case_id(id, number_title)',
    )
    .eq('status', 'open')
    .not('due_at', 'is', null)
    .lte('due_at', horizon.toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`listUpcomingTasks failed: ${error.message}`);
  }
  return normalizeTasks(data ?? []);
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
