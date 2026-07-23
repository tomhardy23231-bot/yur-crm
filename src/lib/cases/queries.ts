import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dateOnlyOrNull, dec, decOrNull, toDbDate, ts, tsOrNull } from '@/lib/db/convert';
import { rpcSearchCaseIds } from '@/lib/db/rpc';
import { Prisma } from '@/generated/prisma/client';
import type { user_role } from '@/generated/prisma/enums';
import { CASE_STAGES } from '@/lib/types/db';
import type {
  BillingType,
  CaseCategory,
  CaseOutcome,
  CasePriority,
  CaseStage,
  CaseType,
  CaseWithRefs,
  ClientKind,
} from '@/lib/types/db';

export const CASES_PAGE_SIZE = 20;

// Допустимые размеры страницы списка дел (селект «на сторінці»; выбор
// запоминается за пользователем в cookie, см. components/cases/cases-page-size).
export const CASES_PAGE_SIZES = [10, 20, 40, 50, 100] as const;

// Поиск (q) идёт в RPC search_case_ids — там свой SQL; чистим спецсимволы как
// прежде (безопасность строкового ввода + wildcard'ы ILIKE `_`/`%`).
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*'"\\%_]/g, '').trim();
}

// Дело видно подразделению, если ЕГО юрист ИЛИ эксперт состоит в подразделении.
// Резолвим id членов подразделения; null — подразделение пустое (→ дел нет).
async function resolveDepartmentMemberIds(
  uid: string,
  departmentId: string,
): Promise<string[] | null> {
  const rows = await userDb(uid, (tx) =>
    tx.public_users.findMany({
      where: { department_id: departmentId },
      select: { id: true },
    }),
  );
  const ids = rows.map((r) => r.id);
  return ids.length > 0 ? ids : null;
}

// Prisma-фрагмент «дело принадлежит подразделению» по id членов.
function departmentWhere(memberIds: string[]): Prisma.casesWhereInput {
  return {
    OR: [{ lawyer_id: { in: memberIds } }, { responsible_id: { in: memberIds } }],
  };
}

export type CaseListItem = {
  id: string;
  number_title: string;
  stage: CaseStage;
  case_type: CaseType;
  category: CaseCategory;
  priority: CasePriority;
  opened_at: string;
  contract_sum: number;
  debt: number;
  // Переплата клиента max(0, paid_total − contract_sum) — для индикатора (U7).
  overpaid: number;
  // Момент входа в текущий этап — для «N дней на этапе» (U6).
  stage_changed_at: string;
  // Дело closed без акта (Задача 4) — для бейджа «без акта» в списке.
  closed_without_act: boolean;
  // Дата закрытия дела (NULL пока не закрыто) — колонка/фильтр на вкладке «Архив».
  closed_at: string | null;
  // v3 s7: исход — для серого бейджа «не заключили» в колонке этапа списка.
  outcome: CaseOutcome | null;
  // Время отправки в архив (NULL — активно). Признак вкладки «Архив».
  archived_at: string | null;
  client: { id: string; name: string } | null;
  lawyer: { id: string; full_name: string } | null;
  responsible: { id: string; full_name: string } | null;
};

// Whitelisted sortable columns (защита от инжекта неизвестного имени в .order()).
export const CASES_SORTABLE_COLUMNS = [
  'number_title',
  'opened_at',
  'contract_sum',
  'debt',
  'stage_changed_at',
] as const;
export type CasesSortColumn = (typeof CASES_SORTABLE_COLUMNS)[number];
export type SortDir = 'asc' | 'desc';

export const CASES_DEFAULT_SORT: { sort: CasesSortColumn; dir: SortDir } = {
  sort: 'opened_at',
  dir: 'desc',
};

export type ListCasesParams = {
  q?: string;
  stage?: CaseStage;
  caseType?: CaseType;
  category?: CaseCategory;
  responsibleId?: string;
  lawyerId?: string;
  clientId?: string;
  departmentId?: string;
  debtOnly?: boolean;
  archived?: boolean;
  closedFrom?: string;
  closedTo?: string;
  page?: number;
  pageSize?: number;
  sort?: CasesSortColumn;
  dir?: SortDir;
};

export type ListCasesResult = {
  items: CaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Общий select строки списка дел (+ join клиента/юриста/эксперта).
const LIST_SELECT = {
  id: true,
  number_title: true,
  stage: true,
  case_type: true,
  category: true,
  priority: true,
  opened_at: true,
  contract_sum: true,
  debt: true,
  overpaid: true,
  stage_changed_at: true,
  closed_without_act: true,
  closed_at: true,
  outcome: true,
  archived_at: true,
  clients: { select: { id: true, name: true } },
  users_cases_lawyer_idTousers: { select: { id: true, full_name: true } },
  users_cases_responsible_idTousers: { select: { id: true, full_name: true } },
} satisfies Prisma.casesSelect;

type ListRow = Prisma.casesGetPayload<{ select: typeof LIST_SELECT }>;

function toCaseListItem(r: ListRow): CaseListItem {
  const l = r.users_cases_lawyer_idTousers;
  const e = r.users_cases_responsible_idTousers;
  return {
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    case_type: r.case_type,
    category: r.category,
    priority: r.priority,
    opened_at: dateOnly(r.opened_at),
    contract_sum: dec(r.contract_sum),
    debt: dec(r.debt),
    overpaid: dec(r.overpaid),
    stage_changed_at: ts(r.stage_changed_at),
    closed_without_act: r.closed_without_act,
    closed_at: dateOnlyOrNull(r.closed_at),
    outcome: (r.outcome as CaseOutcome | null) ?? null,
    archived_at: tsOrNull(r.archived_at),
    client: r.clients ? { id: r.clients.id, name: r.clients.name } : null,
    lawyer: l ? { id: l.id, full_name: l.full_name } : null,
    responsible: e ? { id: e.id, full_name: e.full_name } : null,
  };
}

// RLS-видимость: staff — все; lawyer — lawyer_id=uid; expert — responsible_id=uid.
// Есть q → RPC search_case_ids (поиск по 5 полям) → полные ряды по id.
// Без q → обычный findMany с count.
export async function listCases(
  params: ListCasesParams = {},
): Promise<ListCasesResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? CASES_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const q = params.q ? sanitizeSearch(params.q) : '';
  const sortColumn: CasesSortColumn = params.sort ?? CASES_DEFAULT_SORT.sort;
  const sortDir: SortDir = params.dir ?? CASES_DEFAULT_SORT.dir;

  const user = await getCurrentUser();
  if (!user) {
    return { items: [], total: 0, page, pageSize, pageCount: 1 };
  }
  const uid = user.profile.id;
  const empty: ListCasesResult = {
    items: [],
    total: 0,
    page,
    pageSize,
    pageCount: 1,
  };

  if (q) {
    // Поиск через RPC: id-страница + total; порядок RPC восстанавливаем вручную
    // (findMany по .in вернёт в нативном порядке БД).
    const { rows, total } = await userDb(uid, async (tx) => {
      const matches = await rpcSearchCaseIds(tx, {
        q,
        stage: params.stage ?? null,
        caseType: params.caseType ?? null,
        responsibleId: params.responsibleId ?? null,
        category: params.category ?? null,
        lawyerId: params.lawyerId ?? null,
        clientId: params.clientId ?? null,
        departmentId: params.departmentId ?? null,
        archived: params.archived ?? false,
        closedFrom: params.closedFrom ?? null,
        closedTo: params.closedTo ?? null,
        limit: pageSize,
        offset,
        sort: sortColumn,
        dir: sortDir,
      });
      if (matches.length === 0) return { rows: [] as ListRow[], total: 0 };
      const ids = matches.map((m) => m.id);
      const total = matches[0]!.total;
      const full = await tx.cases.findMany({
        where: { id: { in: ids } },
        select: LIST_SELECT,
      });
      const indexById = new Map(ids.map((id, i) => [id, i]));
      full.sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));
      return { rows: full, total };
    });

    if (rows.length === 0) return empty;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return { items: rows.map(toCaseListItem), total, page, pageSize, pageCount };
  }

  // Фильтр подразделения (без q): резолвим членов; пусто → дел нет.
  let deptMemberIds: string[] | null = null;
  if (params.departmentId) {
    deptMemberIds = await resolveDepartmentMemberIds(uid, params.departmentId);
    if (deptMemberIds === null) return empty;
  }

  const where: Prisma.casesWhereInput = {};
  if (deptMemberIds) Object.assign(where, departmentWhere(deptMemberIds));
  // Вкладка: архив (archived_at not null) vs активные (archived_at null).
  where.archived_at = params.archived ? { not: null } : null;
  if (params.closedFrom || params.closedTo) {
    const closedAt: Prisma.DateTimeNullableFilter = {};
    if (params.closedFrom) closedAt.gte = toDbDate(params.closedFrom);
    if (params.closedTo) closedAt.lte = toDbDate(params.closedTo);
    where.closed_at = closedAt;
  }
  if (params.stage) where.stage = params.stage;
  if (params.caseType) where.case_type = params.caseType;
  if (params.category) where.category = params.category;
  if (params.responsibleId) where.responsible_id = params.responsibleId;
  if (params.lawyerId) where.lawyer_id = params.lawyerId;
  if (params.clientId) where.client_id = params.clientId;
  if (params.debtOnly) where.debt = { gt: 0 };

  // Tie-breaker id desc — стабильный порядок при равных значениях sortColumn.
  const orderBy: Prisma.casesOrderByWithRelationInput[] = [
    { [sortColumn]: sortDir } as Prisma.casesOrderByWithRelationInput,
    { id: 'desc' },
  ];

  const [rows, total] = await Promise.all([
    userDb(uid, (tx) =>
      tx.cases.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ),
    userDb(uid, (tx) => tx.cases.count({ where })),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { items: rows.map(toCaseListItem), total, page, pageSize, pageCount };
}

// Счётчики дел по этапам для строки статус-фильтров (бриф §6). Те же НЕ-этапные
// фильтры, что и список (архив исключён — фильтр на активной вкладке). Один
// groupBy вместо head-count на этап.
export async function countCasesByStage(
  params: Omit<ListCasesParams, 'stage' | 'page' | 'sort' | 'dir' | 'q'> = {},
): Promise<Record<CaseStage, number>> {
  const zero = () =>
    Object.fromEntries(CASE_STAGES.map((s) => [s, 0])) as Record<CaseStage, number>;

  const user = await getCurrentUser();
  if (!user) return zero();
  const uid = user.profile.id;

  let deptMemberIds: string[] | null = null;
  if (params.departmentId) {
    deptMemberIds = await resolveDepartmentMemberIds(uid, params.departmentId);
    if (deptMemberIds === null) return zero();
  }

  const where: Prisma.casesWhereInput = { archived_at: null };
  if (deptMemberIds) Object.assign(where, departmentWhere(deptMemberIds));
  if (params.caseType) where.case_type = params.caseType;
  if (params.category) where.category = params.category;
  if (params.responsibleId) where.responsible_id = params.responsibleId;
  if (params.lawyerId) where.lawyer_id = params.lawyerId;
  if (params.clientId) where.client_id = params.clientId;
  if (params.debtOnly) where.debt = { gt: 0 };

  const grouped = await userDb(uid, (tx) =>
    tx.cases.groupBy({ by: ['stage'], where, _count: { _all: true } }),
  );

  const counts = zero();
  for (const g of grouped) counts[g.stage as CaseStage] = g._count._all;
  return counts;
}

// Полный select карточки дела (+ контакты клиента). updated_at — отдельным raw.
const GET_CASE_SELECT = {
  id: true,
  number_title: true,
  client_id: true,
  lawyer_id: true,
  responsible_id: true,
  opened_at: true,
  case_type: true,
  category: true,
  subject: true,
  description: true,
  stage: true,
  priority: true,
  tags: true,
  contract_sum: true,
  paid_total: true,
  debt: true,
  overpaid: true,
  billing_types: true,
  lawyer_rate_override: true,
  expert_rate_override: true,
  dual_rate_override: true,
  opponent: true,
  court_case_number: true,
  court: true,
  closed_at: true,
  outcome: true,
  lost_reason: true,
  closed_without_act: true,
  stage_changed_at: true,
  archived_at: true,
  archived_by: true,
  created_at: true,
  clients: {
    select: {
      id: true,
      name: true,
      client_kind: true,
      phone: true,
      email: true,
      source: true,
      created_by: true,
    },
  },
  users_cases_lawyer_idTousers: { select: { id: true, full_name: true } },
  users_cases_responsible_idTousers: { select: { id: true, full_name: true } },
} satisfies Prisma.casesSelect;

export async function getCase(id: string): Promise<CaseWithRefs | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const res = await userDb(user.profile.id, async (tx) => {
    const c = await tx.cases.findUnique({ where: { id }, select: GET_CASE_SELECT });
    if (!c) return null;
    // updated_at::text — полная микросекундная точность для optimistic locking
    // (Prisma Date усёк бы микросекунды → ложный конфликт версий, ревью V3-5).
    const rows = await tx.$queryRaw<Array<{ t: string }>>`
      select updated_at::text as t from public.cases where id = ${id}::uuid`;
    return { c, updatedAt: rows[0]?.t ?? '' };
  });
  if (!res) return null;

  const { c, updatedAt } = res;
  const client = c.clients;
  const lawyer = c.users_cases_lawyer_idTousers;
  const responsible = c.users_cases_responsible_idTousers;

  return {
    id: c.id,
    number_title: c.number_title,
    client_id: c.client_id,
    lawyer_id: c.lawyer_id,
    responsible_id: c.responsible_id,
    opened_at: dateOnly(c.opened_at),
    case_type: c.case_type,
    category: c.category,
    subject: c.subject,
    description: c.description,
    stage: c.stage,
    priority: c.priority,
    tags: c.tags ?? [],
    contract_sum: dec(c.contract_sum),
    paid_total: dec(c.paid_total),
    debt: dec(c.debt),
    overpaid: dec(c.overpaid),
    billing_types: (c.billing_types ?? []) as BillingType[],
    lawyer_rate_override: decOrNull(c.lawyer_rate_override),
    expert_rate_override: decOrNull(c.expert_rate_override),
    dual_rate_override: decOrNull(c.dual_rate_override),
    opponent: c.opponent,
    court_case_number: c.court_case_number,
    court: c.court,
    closed_at: dateOnlyOrNull(c.closed_at),
    outcome: (c.outcome as CaseOutcome | null) ?? null,
    lost_reason: c.lost_reason,
    closed_without_act: c.closed_without_act,
    stage_changed_at: ts(c.stage_changed_at),
    archived_at: tsOrNull(c.archived_at),
    archived_by: c.archived_by,
    created_at: ts(c.created_at),
    updated_at: updatedAt,
    client: client
      ? {
          id: client.id,
          name: client.name,
          client_kind: client.client_kind,
          phone: client.phone,
          email: client.email,
          source: client.source,
          created_by: client.created_by,
        }
      : null,
    lawyer: lawyer ? { id: lawyer.id, full_name: lawyer.full_name } : null,
    responsible: responsible
      ? { id: responsible.id, full_name: responsible.full_name }
      : null,
  };
}

// ============================================================================
// Kanban board (доска этапов)
// ============================================================================

export type BoardCaseItem = {
  id: string;
  number_title: string;
  stage: CaseStage;
  priority: CasePriority;
  case_type: CaseType;
  category: CaseCategory;
  opened_at: string;
  stage_changed_at: string;
  contract_sum: number;
  debt: number;
  client: { id: string; name: string } | null;
  lawyer: { id: string; full_name: string } | null;
  responsible: { id: string; full_name: string } | null;
};

// На колонку — мягкий cap: больше 100 карточек в одну стадию не нужно показывать.
export const BOARD_COLUMN_CAP = 100;

const BOARD_SELECT = {
  id: true,
  number_title: true,
  stage: true,
  priority: true,
  case_type: true,
  category: true,
  opened_at: true,
  stage_changed_at: true,
  contract_sum: true,
  debt: true,
  clients: { select: { id: true, name: true } },
  users_cases_lawyer_idTousers: { select: { id: true, full_name: true } },
  users_cases_responsible_idTousers: { select: { id: true, full_name: true } },
} satisfies Prisma.casesSelect;

type BoardRow = Prisma.casesGetPayload<{ select: typeof BOARD_SELECT }>;

// Все RLS-видимые дела для доски. Приоритет (urgent сверху по enum-порядку),
// затем opened_at desc. Группировка — на клиенте.
export async function listCasesForBoard(
  params: {
    responsibleId?: string;
    caseType?: CaseType;
    category?: CaseCategory;
    departmentId?: string;
  } = {},
): Promise<BoardCaseItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const uid = user.profile.id;

  let deptMemberIds: string[] | null = null;
  if (params.departmentId) {
    deptMemberIds = await resolveDepartmentMemberIds(uid, params.departmentId);
    if (deptMemberIds === null) return [];
  }

  const where: Prisma.casesWhereInput = {};
  if (deptMemberIds) Object.assign(where, departmentWhere(deptMemberIds));
  if (params.responsibleId) where.responsible_id = params.responsibleId;
  if (params.caseType) where.case_type = params.caseType;
  if (params.category) where.category = params.category;

  const rows = await userDb(uid, (tx) =>
    tx.cases.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { opened_at: 'desc' }, { id: 'desc' }],
      take: 600,
      select: BOARD_SELECT,
    }),
  );

  return rows.map((r: BoardRow) => {
    const l = r.users_cases_lawyer_idTousers;
    const e = r.users_cases_responsible_idTousers;
    return {
      id: r.id,
      number_title: r.number_title,
      stage: r.stage,
      priority: r.priority,
      case_type: r.case_type,
      category: r.category,
      opened_at: dateOnly(r.opened_at),
      stage_changed_at: ts(r.stage_changed_at),
      contract_sum: dec(r.contract_sum),
      debt: dec(r.debt),
      client: r.clients ? { id: r.clients.id, name: r.clients.name } : null,
      lawyer: l ? { id: l.id, full_name: l.full_name } : null,
      responsible: e ? { id: e.id, full_name: e.full_name } : null,
    };
  });
}

export type AssigneeOption = {
  id: string;
  full_name: string;
};

// Активные пользователи выбранных ролей (RLS users_select_all видна всем активным).
async function listUsersByRoles(
  roles: ReadonlyArray<string>,
): Promise<AssigneeOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    tx.public_users.findMany({
      where: { role: { in: roles as unknown as user_role[] }, is_active: true },
      orderBy: { full_name: 'asc' },
      select: { id: true, full_name: true },
    }),
  );
  return rows.map((r) => ({ id: r.id, full_name: r.full_name }));
}

// Експерты-исполнители (responsible_id). owner/admin тоже могут вести дело.
export function listExpertsForAssignment(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['expert', 'admin', 'owner']);
}

// Юристы-продажники (lawyer_id). owner/admin тоже могут заключать договор.
export function listLawyersForAssignment(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['lawyer', 'admin', 'owner']);
}

// Списки для ФИЛЬТРОВ списка дел (U3) — только «реальные» роли, без owner/admin.
export function listExpertsForFilter(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['expert']);
}
export function listLawyersForFilter(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['lawyer']);
}

export type ClientOption = {
  id: string;
  name: string;
  client_kind: ClientKind;
};

// Все видимые клиенты — для нативного Select формы создания/фильтра. RLS отфильтрует
// невидимых. take:1000 — маркер «Phase 1» (при росте базы — асинхронный комбобокс).
export async function listClientsForSelect(): Promise<ClientOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    tx.clients.findMany({
      orderBy: { name: 'asc' },
      take: 1000,
      select: { id: true, name: true, client_kind: true },
    }),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, client_kind: r.client_kind }));
}

export type CaseSelectOption = {
  id: string;
  number_title: string;
};

// Видимые дела для комбобокса «Дело» (глобальное создание задачи). RLS режет по роли.
export async function listCasesForSelect(): Promise<CaseSelectOption[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await userDb(user.profile.id, (tx) =>
    tx.cases.findMany({
      where: { archived_at: null },
      orderBy: { opened_at: 'desc' },
      take: 300,
      select: { id: true, number_title: true },
    }),
  );
  return rows.map((r) => ({ id: r.id, number_title: r.number_title }));
}
