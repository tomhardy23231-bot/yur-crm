import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, dateOnlyOrNull, dec, ts } from '@/lib/db/convert';
import { Prisma } from '@/generated/prisma/client';
import type {
  CaseSummary,
  Client,
  ClientKind,
} from '@/lib/types/db';

export const CLIENTS_PAGE_SIZE = 20;

// Поисковая строка: `_`/`%` — wildcard'ы ILIKE, а прочие спецсимволы Prisma
// параметризует безопасно. Чистим wildcard'ы, чтобы «50%» не матчил как маска
// (Prisma `contains` их не экранирует) — сохраняем прежнее поведение.
function sanitizeSearch(value: string): string {
  return value.replace(/[%_]/g, '').trim();
}

export type ClientListItem = Client & {
  cases_count: number;
};

export const CLIENTS_SORTABLE_COLUMNS = ['name', 'created_at'] as const;
export type ClientsSortColumn = (typeof CLIENTS_SORTABLE_COLUMNS)[number];
export type SortDir = 'asc' | 'desc';

export const CLIENTS_DEFAULT_SORT: { sort: ClientsSortColumn; dir: SortDir } = {
  sort: 'created_at',
  dir: 'desc',
};

export type ListClientsParams = {
  q?: string;
  kind?: ClientKind;
  page?: number;
  sort?: ClientsSortColumn;
  dir?: SortDir;
};

export type ListClientsResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Поля клиента (порядок как в DTO Client) — общий select для списка/карточки.
const CLIENT_SELECT = {
  id: true,
  name: true,
  client_kind: true,
  last_name: true,
  first_name: true,
  middle_name: true,
  birth_date: true,
  inn: true,
  contract_number: true,
  phone: true,
  email: true,
  address: true,
  source: true,
  notes: true,
  created_by: true,
  created_at: true,
} as const;

type ClientRow = {
  id: string;
  name: string;
  client_kind: Client['client_kind'];
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: Date | null;
  inn: string | null;
  contract_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: Client['source'];
  notes: string | null;
  created_by: string;
  created_at: Date;
};

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    client_kind: r.client_kind,
    last_name: r.last_name,
    first_name: r.first_name,
    middle_name: r.middle_name,
    birth_date: dateOnlyOrNull(r.birth_date),
    inn: r.inn,
    contract_number: r.contract_number,
    phone: r.phone,
    email: r.email,
    address: r.address,
    source: r.source,
    notes: r.notes,
    created_by: r.created_by,
    created_at: ts(r.created_at),
  };
}

// RLS-видимость:
//   - staff (owner/admin/office_manager) — все клиенты;
//   - lawyer/expert — клиенты, привязанные к их видимым делам.
// На уровне запроса фильтры не дублируем — RLS политика делает это сама.
export async function listClients(
  params: ListClientsParams = {},
): Promise<ListClientsResult> {
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * CLIENTS_PAGE_SIZE;
  const sortColumn: ClientsSortColumn = params.sort ?? CLIENTS_DEFAULT_SORT.sort;
  const sortDir: SortDir = params.dir ?? CLIENTS_DEFAULT_SORT.dir;

  const user = await getCurrentUser();
  if (!user) {
    return { items: [], total: 0, page, pageSize: CLIENTS_PAGE_SIZE, pageCount: 1 };
  }
  const uid = user.profile.id;

  const q = params.q ? sanitizeSearch(params.q) : '';
  const where: Prisma.clientsWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { inn: { contains: q, mode: 'insensitive' } },
      { contract_number: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (params.kind) where.client_kind = params.kind;

  const orderBy: Prisma.clientsOrderByWithRelationInput[] =
    sortColumn === 'name'
      ? [{ name: sortDir }, { id: 'desc' }]
      : [{ created_at: sortDir }, { id: 'desc' }];

  // Страница и общий счётчик — параллельными userDb-транзакциями (норма §4.3;
  // внутри одной interactive-tx параллелить нельзя — один коннект).
  const [rows, total] = await Promise.all([
    userDb(uid, (tx) =>
      tx.clients.findMany({
        where,
        orderBy,
        skip: offset,
        take: CLIENTS_PAGE_SIZE,
        select: { ...CLIENT_SELECT, _count: { select: { cases: true } } },
      }),
    ),
    userDb(uid, (tx) => tx.clients.count({ where })),
  ]);

  const items: ClientListItem[] = rows.map((r) => ({
    ...toClient(r),
    cases_count: r._count.cases,
  }));

  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  return { items, total, page, pageSize: CLIENTS_PAGE_SIZE, pageCount };
}

export async function getClient(id: string): Promise<Client | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await userDb(user.profile.id, (tx) =>
    tx.clients.findUnique({ where: { id }, select: CLIENT_SELECT }),
  );
  return row ? toClient(row) : null;
}

export async function getClientCases(clientId: string): Promise<CaseSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.cases.findMany({
      where: { client_id: clientId },
      orderBy: { opened_at: 'desc' },
      select: {
        id: true,
        number_title: true,
        stage: true,
        opened_at: true,
        contract_sum: true,
        debt: true,
        users_cases_responsible_idTousers: {
          select: { id: true, full_name: true },
        },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    opened_at: dateOnly(r.opened_at),
    contract_sum: dec(r.contract_sum),
    debt: dec(r.debt),
    responsible: r.users_cases_responsible_idTousers
      ? {
          id: r.users_cases_responsible_idTousers.id,
          full_name: r.users_cases_responsible_idTousers.full_name,
        }
      : null,
  }));
}
