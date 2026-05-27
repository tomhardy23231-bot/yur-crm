import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CaseStage,
  CaseSummary,
  Client,
  ClientKind,
} from '@/lib/types/db';

export const CLIENTS_PAGE_SIZE = 20;

// Поисковая строка идёт через PostgREST .or() — там запятая/паренсы/звёздочка
// меняют структуру фильтра. Это пользовательский ввод, поэтому экранируем.
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*'"\\%]/g, '').trim();
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

// RLS-видимость:
//   - owner/admin — все клиенты;
//   - specialist/assistant — клиенты, привязанные к их видимым делам.
// На уровне запроса фильтры не дублируем — RLS политика делает это сама.
export async function listClients(
  params: ListClientsParams = {},
): Promise<ListClientsResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * CLIENTS_PAGE_SIZE;
  const sortColumn: ClientsSortColumn = params.sort ?? CLIENTS_DEFAULT_SORT.sort;
  const sortDir: SortDir = params.dir ?? CLIENTS_DEFAULT_SORT.dir;
  const ascending = sortDir === 'asc';

  let query = supabase
    .from('clients')
    .select(
      'id, name, client_kind, phone, email, address, notes, created_by, created_at, cases(count)',
      { count: 'exact' },
    )
    .order(sortColumn, { ascending })
    .order('id', { ascending: false })
    .range(offset, offset + CLIENTS_PAGE_SIZE - 1);

  const q = params.q ? sanitizeSearch(params.q) : '';
  if (q) {
    query = query.or(
      `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }
  if (params.kind) {
    query = query.eq('client_kind', params.kind);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`listClients failed: ${error.message}`);
  }

  type Row = Omit<Client, never> & {
    cases: ReadonlyArray<{ count: number }>;
  };

  const items: ClientListItem[] = (data ?? []).map((row) => {
    const r = row as Row;
    const casesCount = r.cases[0]?.count ?? 0;
    return {
      id: r.id,
      name: r.name,
      client_kind: r.client_kind,
      phone: r.phone,
      email: r.email,
      address: r.address,
      notes: r.notes,
      created_by: r.created_by,
      created_at: r.created_at,
      cases_count: casesCount,
    };
  });

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));

  return { items, total, page, pageSize: CLIENTS_PAGE_SIZE, pageCount };
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, client_kind, phone, email, address, notes, created_by, created_at')
    .eq('id', id)
    .maybeSingle<Client>();

  if (error) {
    throw new Error(`getClient failed: ${error.message}`);
  }
  return data;
}

export async function getClientCases(clientId: string): Promise<CaseSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .select(
      'id, number_title, stage, opened_at, contract_sum, debt, responsible:responsible_id(id, full_name)',
    )
    .eq('client_id', clientId)
    .order('opened_at', { ascending: false });

  if (error) {
    throw new Error(`getClientCases failed: ${error.message}`);
  }

  // PostgREST через supabase-js возвращает FK-объект как массив (даже если
  // это many-to-one). Сворачиваем в первый элемент.
  type Row = {
    id: string;
    number_title: string;
    stage: CaseStage;
    opened_at: string;
    contract_sum: number | string;
    debt: number | string;
    responsible: ReadonlyArray<{ id: string; full_name: string }> | { id: string; full_name: string } | null;
  };

  return (data ?? []).map((row) => {
    const r = row as unknown as Row;
    const responsible = Array.isArray(r.responsible)
      ? (r.responsible[0] ?? null)
      : r.responsible;
    return {
      id: r.id,
      number_title: r.number_title,
      stage: r.stage,
      opened_at: r.opened_at,
      contract_sum: Number(r.contract_sum),
      debt: Number(r.debt),
      responsible,
    };
  });
}
