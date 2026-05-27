import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  BillingType,
  Case,
  CasePriority,
  CaseStage,
  CaseType,
  CaseWithRefs,
  ClientKind,
  SpecialistType,
} from '@/lib/types/db';

export const CASES_PAGE_SIZE = 20;

// PostgREST .or() — пользовательский ввод санитайзим (как в clients/queries.ts).
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*'"\\%]/g, '').trim();
}

export type CaseListItem = {
  id: string;
  number_title: string;
  stage: CaseStage;
  case_type: CaseType;
  priority: CasePriority;
  opened_at: string;
  contract_sum: number;
  debt: number;
  client: { id: string; name: string } | null;
  responsible: { id: string; full_name: string } | null;
};

export type ListCasesParams = {
  q?: string;
  stage?: CaseStage;
  caseType?: CaseType;
  responsibleId?: string;
  page?: number;
};

export type ListCasesResult = {
  items: CaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// RLS-видимость:
//   - owner/admin — все дела;
//   - specialist  — где responsible_id = uid;
//   - assistant   — где responsible_id = supervisor_id.
// Фильтры на уровне запроса — только пользовательские, безопасность от RLS.
//
// Когда есть q → используем RPC search_case_ids (миграция 20260527130000):
// поиск идёт по 5 полям (number_title, opponent, court_case_number,
// client.name через JOIN, tags через unnest). RPC возвращает (id, total),
// затем подтягиваем полные ряды с PostgREST-join'ом по найденным id.
// Без q → обычный flow со встроенным count: 'exact'.
export async function listCases(
  params: ListCasesParams = {},
): Promise<ListCasesResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * CASES_PAGE_SIZE;
  const q = params.q ? sanitizeSearch(params.q) : '';

  type RawRow = {
    id: string;
    number_title: string;
    stage: CaseStage;
    case_type: CaseType;
    priority: CasePriority;
    opened_at: string;
    contract_sum: number | string;
    debt: number | string;
    client:
      | ReadonlyArray<{ id: string; name: string }>
      | { id: string; name: string }
      | null;
    responsible:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  const SELECT =
    'id, number_title, stage, case_type, priority, opened_at, contract_sum, debt, ' +
    'client:client_id(id, name), responsible:responsible_id(id, full_name)';

  if (q) {
    // Поиск через RPC. Дополнительные фильтры передаём в RPC, чтобы
    // pagination и count были консистентны с фильтрами.
    const { data: matchRows, error: matchErr } = await supabase.rpc(
      'search_case_ids',
      {
        p_q: q,
        p_stage: params.stage ?? null,
        p_case_type: params.caseType ?? null,
        p_responsible_id: params.responsibleId ?? null,
        p_limit: CASES_PAGE_SIZE,
        p_offset: offset,
      },
    );
    if (matchErr) {
      throw new Error(`search_case_ids failed: ${matchErr.message}`);
    }

    type MatchRow = { id: string; total: number | string };
    const matches = (matchRows ?? []) as MatchRow[];
    if (matches.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize: CASES_PAGE_SIZE,
        pageCount: 1,
      };
    }

    const ids = matches.map((r) => r.id);
    const total = Number(matches[0]!.total);

    // Подтягиваем полные ряды по найденным id; РУЧНО восстанавливаем порядок
    // из RPC (.in возвращает в нативном порядке БД, не в нашем).
    const { data: fullRows, error } = await supabase
      .from('cases')
      .select(SELECT)
      .in('id', ids);
    if (error) {
      throw new Error(`listCases (with q) failed: ${error.message}`);
    }

    const indexById = new Map(ids.map((id, idx) => [id, idx]));
    const items: CaseListItem[] = (fullRows ?? [])
      .map((row) => normalizeRow(row as unknown as RawRow))
      .sort(
        (a, b) =>
          (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0),
      );

    const pageCount = Math.max(1, Math.ceil(total / CASES_PAGE_SIZE));
    return { items, total, page, pageSize: CASES_PAGE_SIZE, pageCount };
  }

  // Без q — обычный listCases с .eq фильтрами и count:'exact'.
  let query = supabase
    .from('cases')
    .select(SELECT, { count: 'exact' })
    .order('opened_at', { ascending: false })
    .range(offset, offset + CASES_PAGE_SIZE - 1);

  if (params.stage) query = query.eq('stage', params.stage);
  if (params.caseType) query = query.eq('case_type', params.caseType);
  if (params.responsibleId)
    query = query.eq('responsible_id', params.responsibleId);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`listCases failed: ${error.message}`);
  }

  const items: CaseListItem[] = (data ?? []).map((row) =>
    normalizeRow(row as unknown as RawRow),
  );

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / CASES_PAGE_SIZE));

  return { items, total, page, pageSize: CASES_PAGE_SIZE, pageCount };
}

// Сворачивает PostgREST-массив-join в одиночный объект.
function normalizeRow(r: {
  id: string;
  number_title: string;
  stage: CaseStage;
  case_type: CaseType;
  priority: CasePriority;
  opened_at: string;
  contract_sum: number | string;
  debt: number | string;
  client:
    | ReadonlyArray<{ id: string; name: string }>
    | { id: string; name: string }
    | null;
  responsible:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
}): CaseListItem {
  const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
  const responsible = Array.isArray(r.responsible)
    ? (r.responsible[0] ?? null)
    : r.responsible;
  return {
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    case_type: r.case_type,
    priority: r.priority,
    opened_at: r.opened_at,
    contract_sum: Number(r.contract_sum),
    debt: Number(r.debt),
    client,
    responsible,
  };
}

export async function getCase(id: string): Promise<CaseWithRefs | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .select(
      'id, number_title, client_id, responsible_id, opened_at, case_type, stage, priority, tags, ' +
        'contract_sum, paid_total, debt, billing_types, opponent, court_case_number, court, closed_at, created_at, ' +
        'client:client_id(id, name, client_kind), responsible:responsible_id(id, full_name, specialist_type)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`getCase failed: ${error.message}`);
  }
  if (!data) return null;

  type Row = Omit<Case, 'contract_sum' | 'paid_total' | 'debt'> & {
    contract_sum: number | string;
    paid_total: number | string;
    debt: number | string;
    client:
      | ReadonlyArray<{ id: string; name: string; client_kind: ClientKind }>
      | { id: string; name: string; client_kind: ClientKind }
      | null;
    responsible:
      | ReadonlyArray<{
          id: string;
          full_name: string;
          specialist_type: SpecialistType | null;
        }>
      | {
          id: string;
          full_name: string;
          specialist_type: SpecialistType | null;
        }
      | null;
  };

  const r = data as unknown as Row;
  const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
  const responsible = Array.isArray(r.responsible)
    ? (r.responsible[0] ?? null)
    : r.responsible;

  return {
    id: r.id,
    number_title: r.number_title,
    client_id: r.client_id,
    responsible_id: r.responsible_id,
    opened_at: r.opened_at,
    case_type: r.case_type,
    stage: r.stage,
    priority: r.priority,
    tags: r.tags ?? [],
    contract_sum: Number(r.contract_sum),
    paid_total: Number(r.paid_total),
    debt: Number(r.debt),
    billing_types: (r.billing_types ?? []) as BillingType[],
    opponent: r.opponent,
    court_case_number: r.court_case_number,
    court: r.court,
    closed_at: r.closed_at,
    created_at: r.created_at,
    client,
    responsible,
  };
}

export type SpecialistOption = {
  id: string;
  full_name: string;
  specialist_type: SpecialistType | null;
};

// Список активных специалистов для выбора ответственного.
// RLS на users разрешает SELECT любому активному authenticated, поэтому
// сюда приходят все специалисты системы (нам и нужно).
export async function listSpecialistsForAssignment(): Promise<SpecialistOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, specialist_type')
    .eq('role', 'specialist')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`listSpecialistsForAssignment failed: ${error.message}`);
  }
  return (data ?? []) as SpecialistOption[];
}

export type ClientOption = {
  id: string;
  name: string;
  client_kind: ClientKind;
};

// Все видимые клиенты (без пагинации) — для нативного Select в форме создания.
// RLS уже отфильтрует невидимых для текущего пользователя.
export async function listClientsForSelect(): Promise<ClientOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, client_kind')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`listClientsForSelect failed: ${error.message}`);
  }
  return (data ?? []) as ClientOption[];
}
