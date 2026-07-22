import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';
import { UUID_RE } from '@/lib/validation';
import type { ActivityChanges, ActivityLogEntry } from './queries';

// ============================================================================
// Глобальная лента активности «Журнал» (/journal), 2026-07-21.
// Читает activity_log целиком (без фильтра по entity) — RLS сама режет
// невидимое: owner видит всё; керівник/офіс-менеджер — свой скоуп; юрист и
// эксперт — события своих дел; owner-only категории (касса, ставки, входы,
// отпуска, реквизиты) — только владелец (миграция 0006).
// ============================================================================

// Группы событий для фильтра «Тип события». Ключи зеркалятся в словаре
// t.journal.groups. Порядок = порядок пунктов в селекте.
export const JOURNAL_GROUPS = {
  cases: [
    'case_created',
    'case_updated',
    'case_deleted',
    'case_lost',
    'case_archived',
    'case_restored',
    'stage_corrected',
  ],
  finance: [
    'payment_created',
    'payment_updated',
    'payment_deleted',
    'payment_plan_updated',
    'act_created',
    'act_paid',
    'act_deleted',
    'act_completion_changed',
  ],
  payroll: [
    'payroll_paid',
    'payroll_reverted',
    'payroll_payout',
    'payroll_bonus',
    'payroll_tx_deleted',
    'payroll_rates_changed',
    'user_salary_changed',
  ],
  docs: ['document_uploaded', 'document_deleted', 'document_downloaded'],
  tasks: ['task_created', 'task_updated', 'task_toggled', 'task_deleted'],
  comments: ['comment_added', 'comment_edited', 'comment_deleted'],
  clients: ['client_created', 'client_updated', 'client_deleted'],
  team: [
    'user_created',
    'user_role_changed',
    'user_deactivated',
    'user_reactivated',
    'user_permissions_changed',
    'user_department_changed',
    'user_password_reset',
    'user_password_changed',
    'user_email_changed',
    'user_invited',
    'user_deleted',
    'department_created',
    'department_renamed',
    'department_activated',
    'department_deactivated',
    'org_requisites_updated',
  ],
  security: ['user_login', 'user_login_failed'],
  cash: [
    'cash_account_created',
    'cash_account_updated',
    'cash_entry_created',
    'cash_entry_updated',
    'cash_entry_deleted',
  ],
  absences: ['absence_created', 'absence_deleted'],
} as const;

export type JournalGroup = keyof typeof JOURNAL_GROUPS;

export const JOURNAL_GROUP_KEYS = Object.keys(JOURNAL_GROUPS) as JournalGroup[];

export function isJournalGroup(v: string): v is JournalGroup {
  return v in JOURNAL_GROUPS;
}

// Пагинация «Показать ещё»: стартовая порция и потолок (защита от ?limit=99999).
export const JOURNAL_PAGE_SIZE = 60;
export const JOURNAL_LIMIT_CAP = 480;

export type JournalParams = {
  /** Фильтр «кто сделал» (user_id записи журнала). */
  userId?: string;
  /** Группа событий (ключ JOURNAL_GROUPS). */
  group?: JournalGroup;
  /** Период по дате события, YYYY-MM-DD включительно (Киев). */
  from?: string;
  to?: string;
  /** Сколько записей отдать (растёт кнопкой «Показать ещё»). */
  limit: number;
};

// Текущее смещение Киева ('+02:00'/'+03:00') — как в tasks/queries.ts.
function kyivOffset(): string {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value;
  return /GMT([+-]\d{2}:\d{2})/.exec(tzName ?? '')?.[1] ?? '+02:00';
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Начало киевского дня (UTC-instant); exclusive-конец = начало следующего дня.
function kyivDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${kyivOffset()}`);
}

function kyivNextDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return kyivDayStart(next);
}

// Ключ киевского дня события ('YYYY-MM-DD') — для группировки ленты по дням.
const KYIV_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function kyivDayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : KYIV_DAY_FMT.format(d);
}

export type JournalResult = {
  entries: ActivityLogEntry[];
  /** true — записей ровно limit: почти наверняка есть ещё (показать кнопку). */
  hasMore: boolean;
};

export async function listJournal(params: JournalParams): Promise<JournalResult> {
  const user = await getCurrentUser();
  if (!user) return { entries: [], hasMore: false };

  const limit = Math.min(Math.max(params.limit, 1), JOURNAL_LIMIT_CAP);

  const where: {
    user_id?: string;
    action?: { in: string[] };
    created_at?: { gte?: Date; lt?: Date };
  } = {};

  if (params.userId && UUID_RE.test(params.userId)) where.user_id = params.userId;
  if (params.group) where.action = { in: [...JOURNAL_GROUPS[params.group]] };

  const createdAt: { gte?: Date; lt?: Date } = {};
  if (params.from && DAY_RE.test(params.from)) createdAt.gte = kyivDayStart(params.from);
  if (params.to && DAY_RE.test(params.to)) createdAt.lt = kyivNextDayStart(params.to);
  if (createdAt.gte || createdAt.lt) where.created_at = createdAt;

  const rows = await userDb(user.profile.id, (tx) =>
    tx.activity_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        changes: true,
        created_at: true,
        users: { select: { id: true, full_name: true } },
      },
    }),
  );

  const entries = rows.map((r) => ({
    id: Number(r.id),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    action: r.action,
    changes: (r.changes as ActivityChanges | null) ?? null,
    created_at: ts(r.created_at),
    user: r.users ? { id: r.users.id, full_name: r.users.full_name } : null,
  }));

  return { entries, hasMore: entries.length === limit };
}

// ============================================================================
// Резолв целей событий в подписи и ссылки: дело → номер/название (/cases/:id),
// клиент → имя (/clients/:id), сотрудник → ФИО (/reports/payroll/:id).
// RLS режет невидимое — тогда чип цели просто не показывается.
// ============================================================================
export type JournalTargets = {
  caseById: Map<string, string>;
  clientById: Map<string, string>;
  userById: Map<string, string>;
};

export async function resolveJournalTargets(
  entries: ReadonlyArray<ActivityLogEntry>,
): Promise<JournalTargets> {
  const caseIds = new Set<string>();
  const clientIds = new Set<string>();
  const userIds = new Set<string>();

  for (const e of entries) {
    if (!UUID_RE.test(e.entity_id)) continue;
    if (e.entity_type === 'case') caseIds.add(e.entity_id);
    else if (e.entity_type === 'client') clientIds.add(e.entity_id);
    else if (
      e.entity_type === 'user' ||
      e.entity_type === 'absence' ||
      e.entity_type === 'auth'
    ) {
      userIds.add(e.entity_id);
    }
  }

  const empty: JournalTargets = {
    caseById: new Map(),
    clientById: new Map(),
    userById: new Map(),
  };
  if (caseIds.size === 0 && clientIds.size === 0 && userIds.size === 0) return empty;

  const user = await getCurrentUser();
  if (!user) return empty;

  const [cases, clients, users] = await userDb(user.profile.id, (tx) =>
    Promise.all([
      caseIds.size > 0
        ? tx.cases.findMany({
            where: { id: { in: [...caseIds] } },
            select: { id: true, number_title: true },
          })
        : Promise.resolve([]),
      clientIds.size > 0
        ? tx.clients.findMany({
            where: { id: { in: [...clientIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.size > 0
        ? tx.public_users.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, full_name: true },
          })
        : Promise.resolve([]),
    ]),
  );

  return {
    caseById: new Map(cases.map((c) => [c.id, c.number_title])),
    clientById: new Map(clients.map((c) => [c.id, c.name])),
    userById: new Map(users.map((u) => [u.id, u.full_name])),
  };
}

// Активные сотрудники для фильтра «Кто» (users_select_all — виден всем staff).
export async function listJournalUsers(): Promise<
  Array<{ id: string; full_name: string }>
> {
  const user = await getCurrentUser();
  if (!user) return [];
  return userDb(user.profile.id, (tx) =>
    tx.public_users.findMany({
      where: { is_active: true },
      select: { id: true, full_name: true },
      orderBy: { full_name: 'asc' },
    }),
  );
}
