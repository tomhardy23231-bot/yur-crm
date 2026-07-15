import 'server-only';
import { cache } from 'react';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts, tsOrNull } from '@/lib/db/convert';
import { Prisma } from '@/generated/prisma/client';
import { kyivToday } from '@/lib/payroll/month';
import type { TaskStatus, TaskWithRefs } from '@/lib/types/db';

export const TASKS_PAGE_SIZE = 30;

// Общий select задачи с join-ами (assignee + дело). Sort «open впереди, потом
// due_at asc nulls last, потом created_at desc» — enum task_status(open,done)
// упорядочен определением, поэтому status asc → open первым (как было в PostgREST).
const TASK_SELECT = {
  id: true,
  case_id: true,
  title: true,
  description: true,
  kind: true,
  assignee_id: true,
  created_by: true,
  due_at: true,
  status: true,
  created_at: true,
  users_tasks_assignee_idTousers: { select: { id: true, full_name: true } },
  cases: { select: { id: true, number_title: true } },
} satisfies Prisma.tasksSelect;

type TaskRow = Prisma.tasksGetPayload<{ select: typeof TASK_SELECT }>;

const TASK_LIST_ORDER: Prisma.tasksOrderByWithRelationInput[] = [
  { status: 'asc' },
  { due_at: { sort: 'asc', nulls: 'last' } },
  { created_at: 'desc' },
];

function toTaskWithRefs(r: TaskRow): TaskWithRefs {
  const a = r.users_tasks_assignee_idTousers;
  return {
    id: r.id,
    case_id: r.case_id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    assignee_id: r.assignee_id,
    created_by: r.created_by,
    due_at: tsOrNull(r.due_at),
    status: r.status,
    created_at: ts(r.created_at),
    assignee: a ? { id: a.id, full_name: a.full_name } : null,
    case: r.cases ? { id: r.cases.id, number_title: r.cases.number_title } : null,
  };
}

// =====================================================================
// listTasksByCase — список задач на карточке дела.
// =====================================================================
export const listTasksByCase = cache(
  async (caseId: string): Promise<TaskWithRefs[]> => {
    const user = await getCurrentUser();
    if (!user) return [];
    const rows = await userDb(user.profile.id, (tx) =>
      tx.tasks.findMany({
        where: { case_id: caseId },
        orderBy: TASK_LIST_ORDER,
        select: TASK_SELECT,
      }),
    );
    return rows.map(toTaskWithRefs);
  },
);

// =====================================================================
// listTasksForUser — общая страница /tasks.
// assigneeMode='mine' — только assigned к userId; 'all' — все видимые (RLS уже
// отрезала чужие дела). RLS-контекст — сессия getCurrentUser, фильтр — по userId.
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
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * TASKS_PAGE_SIZE;

  const user = await getCurrentUser();
  if (!user) {
    return { items: [], total: 0, page, pageSize: TASKS_PAGE_SIZE, pageCount: 1 };
  }
  const uid = user.profile.id;

  const where: Prisma.tasksWhereInput = {};
  if (params.status) where.status = params.status;
  if ((params.assigneeMode ?? 'mine') === 'mine') where.assignee_id = params.userId;

  const [rows, total] = await Promise.all([
    userDb(uid, (tx) =>
      tx.tasks.findMany({
        where,
        orderBy: [{ status: 'asc' }, { due_at: { sort: 'asc', nulls: 'last' } }],
        skip: offset,
        take: TASKS_PAGE_SIZE,
        select: TASK_SELECT,
      }),
    ),
    userDb(uid, (tx) => tx.tasks.count({ where })),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE));
  return { items: rows.map(toTaskWithRefs), total, page, pageSize: TASKS_PAGE_SIZE, pageCount };
}

// =====================================================================
// listTasksInRange — /calendar. Видимые задачи c due_at в [from, to).
// =====================================================================
export async function listTasksInRange(params: {
  from: string;
  to: string;
}): Promise<TaskWithRefs[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    tx.tasks.findMany({
      where: { due_at: { gte: new Date(params.from), lt: new Date(params.to) } },
      orderBy: { due_at: 'asc' },
      select: TASK_SELECT,
    }),
  );
  return rows.map(toTaskWithRefs);
}

// =====================================================================
// countOpenTasksAssignedTo — счётчик для sidebar.
// =====================================================================
export async function countOpenTasksAssignedTo(userId: string): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  return userDb(user.profile.id, (tx) =>
    tx.tasks.count({ where: { assignee_id: userId, status: 'open' } }),
  );
}

// =====================================================================
// countUserTasksDue — честный колокольчик топбара (v3 Сессия 6).
// =====================================================================

// Текущее смещение Киева ('+02:00'/'+03:00') из Intl longOffset.
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
  const [y, m, d] = kyivToday().split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return new Date(`${next}T00:00:00${kyivOffset()}`).toISOString();
}

export type UserTasksDue = { overdue: number; today: number };

export async function countUserTasksDue(userId: string): Promise<UserTasksDue> {
  const user = await getCurrentUser();
  if (!user) return { overdue: 0, today: 0 };
  const uid = user.profile.id;
  const now = new Date();
  const dayEnd = new Date(kyivTodayEndIso());

  const [overdue, today] = await Promise.all([
    userDb(uid, (tx) =>
      tx.tasks.count({
        where: { assignee_id: userId, status: 'open', due_at: { lt: now } },
      }),
    ),
    userDb(uid, (tx) =>
      tx.tasks.count({
        where: {
          assignee_id: userId,
          status: 'open',
          due_at: { gte: now, lt: dayEnd },
        },
      }),
    ),
  ]);
  return { overdue, today };
}

// =====================================================================
// listUpcomingTasks — приближающиеся сроки (Шаг 10, напоминания).
// RLS отрежет невидимые. v3 s4: overdue (просрочено) отдельно от soon (окно).
// =====================================================================
export type UpcomingTasks = {
  overdue: TaskWithRefs[];
  overdueCount: number;
  soon: TaskWithRefs[];
  /** «Мой день» (v3 s11): открытые задачи todayForUserId в сегодняшнем киевском
   *  дне (включая уже просроченные сегодня). Пуст без параметра. */
  today: TaskWithRefs[];
};

export async function listUpcomingTasks(
  params: {
    hoursAhead?: number;
    limit?: number;
    overdueLimit?: number;
    /** Если задан — третьим лёгким запросом срез «сегодня» этого пользователя. */
    todayForUserId?: string;
  } = {},
): Promise<UpcomingTasks> {
  const hoursAhead = params.hoursAhead ?? 72;
  const limit = Math.max(1, params.limit ?? 10);
  const overdueLimit = Math.max(1, params.overdueLimit ?? 3);

  const user = await getCurrentUser();
  if (!user) return { overdue: [], overdueCount: 0, soon: [], today: [] };
  const uid = user.profile.id;

  const now = new Date();
  const horizon = new Date(Date.now() + hoursAhead * 3600 * 1000);

  const overdueWhere: Prisma.tasksWhereInput = {
    status: 'open',
    due_at: { lt: now },
  };
  const soonWhere: Prisma.tasksWhereInput = {
    status: 'open',
    due_at: { gte: now, lt: horizon },
  };

  const [overdue, overdueCount, soon, today] = await Promise.all([
    // Просроченные: самые свежие сверху (due_at desc), топ-N.
    userDb(uid, (tx) =>
      tx.tasks.findMany({
        where: overdueWhere,
        orderBy: { due_at: 'desc' },
        take: overdueLimit,
        select: TASK_SELECT,
      }),
    ),
    userDb(uid, (tx) => tx.tasks.count({ where: overdueWhere })),
    // Ближайшие: окно [now, now+hoursAhead), по возрастанию срока.
    userDb(uid, (tx) =>
      tx.tasks.findMany({
        where: soonWhere,
        orderBy: { due_at: 'asc' },
        take: limit,
        select: TASK_SELECT,
      }),
    ),
    // «Мой день»: сегодняшний киевский день целиком, только свои задачи.
    params.todayForUserId
      ? userDb(uid, (tx) =>
          tx.tasks.findMany({
            where: {
              status: 'open',
              assignee_id: params.todayForUserId,
              due_at: {
                gte: new Date(kyivTodayStartIso()),
                lt: new Date(kyivTodayEndIso()),
              },
            },
            orderBy: { due_at: 'asc' },
            take: 20,
            select: TASK_SELECT,
          }),
        )
      : Promise.resolve<TaskRow[]>([]),
  ]);

  return {
    overdue: overdue.map(toTaskWithRefs),
    overdueCount,
    soon: soon.map(toTaskWithRefs),
    today: today.map(toTaskWithRefs),
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
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    tx.public_users.findMany({
      where: { is_active: true },
      orderBy: { full_name: 'asc' },
      select: { id: true, full_name: true, role: true },
    }),
  );
  return rows.map((r) => ({ id: r.id, full_name: r.full_name, role: r.role }));
}

// =====================================================================
// getTask — одна задача с join-ами (для /tasks/[id]/edit, если понадобится).
// =====================================================================
export async function getTask(id: string): Promise<TaskWithRefs | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const row = await userDb(user.profile.id, (tx) =>
    tx.tasks.findUnique({ where: { id }, select: TASK_SELECT }),
  );
  return row ? toTaskWithRefs(row) : null;
}
