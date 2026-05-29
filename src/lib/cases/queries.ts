import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  BillingType,
  Case,
  CaseCategory,
  CasePriority,
  CaseStage,
  CaseType,
  CaseWithRefs,
  ClientKind,
} from '@/lib/types/db';

export const CASES_PAGE_SIZE = 20;

// PostgREST .or() — пользовательский ввод санитайзим (как в clients/queries.ts).
// Убираем `_` помимо `%` — оба wildcard'а PostgreSQL ILIKE, иначе «task_5»
// матчит «task15»/«taskA5» (LOW#8 из внешнего ревью).
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*'"\\%_]/g, '').trim();
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
  page?: number;
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

// RLS-видимость:
//   - staff (owner/admin/office_manager) — все дела;
//   - lawyer  — где lawyer_id = uid;
//   - expert  — где responsible_id = uid.
// Фильтры на уровне запроса — только пользовательские, безопасность от RLS.
//
// Когда есть q → используем RPC search_case_ids: поиск идёт по 5 полям
// (number_title, opponent, court_case_number, client.name через JOIN,
// tags через unnest). RPC возвращает (id, total), затем подтягиваем полные
// ряды с PostgREST-join'ом по найденным id. Без q → обычный flow с count:'exact'.
export async function listCases(
  params: ListCasesParams = {},
): Promise<ListCasesResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * CASES_PAGE_SIZE;
  const q = params.q ? sanitizeSearch(params.q) : '';
  const sortColumn: CasesSortColumn = params.sort ?? CASES_DEFAULT_SORT.sort;
  const sortDir: SortDir = params.dir ?? CASES_DEFAULT_SORT.dir;
  const ascending = sortDir === 'asc';

  type RawRow = {
    id: string;
    number_title: string;
    stage: CaseStage;
    case_type: CaseType;
    category: CaseCategory;
    priority: CasePriority;
    opened_at: string;
    contract_sum: number | string;
    debt: number | string;
    client:
      | ReadonlyArray<{ id: string; name: string }>
      | { id: string; name: string }
      | null;
    lawyer:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
    responsible:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  const SELECT =
    'id, number_title, stage, case_type, category, priority, opened_at, contract_sum, debt, ' +
    'client:client_id(id, name), lawyer:lawyer_id(id, full_name), responsible:responsible_id(id, full_name)';

  if (q) {
    // Поиск через RPC. Дополнительные фильтры передаём в RPC, чтобы
    // pagination и count были консистентны с фильтрами. p_sort/p_dir —
    // сортировка в SQL ДО LIMIT/OFFSET (внешнее ревью HIGH#3).
    const { data: matchRows, error: matchErr } = await supabase.rpc(
      'search_case_ids',
      {
        p_q: q,
        p_stage: params.stage ?? null,
        p_case_type: params.caseType ?? null,
        p_responsible_id: params.responsibleId ?? null,
        p_category: params.category ?? null,
        p_limit: CASES_PAGE_SIZE,
        p_offset: offset,
        p_sort: sortColumn,
        p_dir: sortDir,
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
  // Tie-breaker: id desc — стабильный порядок если в sortColumn одинаковые значения.
  let query = supabase
    .from('cases')
    .select(SELECT, { count: 'exact' })
    .order(sortColumn, { ascending })
    .order('id', { ascending: false })
    .range(offset, offset + CASES_PAGE_SIZE - 1);

  if (params.stage) query = query.eq('stage', params.stage);
  if (params.caseType) query = query.eq('case_type', params.caseType);
  if (params.category) query = query.eq('category', params.category);
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
  category: CaseCategory;
  priority: CasePriority;
  opened_at: string;
  contract_sum: number | string;
  debt: number | string;
  client:
    | ReadonlyArray<{ id: string; name: string }>
    | { id: string; name: string }
    | null;
  lawyer:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
  responsible:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
}): CaseListItem {
  const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
  const lawyer = Array.isArray(r.lawyer) ? (r.lawyer[0] ?? null) : r.lawyer;
  const responsible = Array.isArray(r.responsible)
    ? (r.responsible[0] ?? null)
    : r.responsible;
  return {
    id: r.id,
    number_title: r.number_title,
    stage: r.stage,
    case_type: r.case_type,
    category: r.category,
    priority: r.priority,
    opened_at: r.opened_at,
    contract_sum: Number(r.contract_sum),
    debt: Number(r.debt),
    client,
    lawyer,
    responsible,
  };
}

export async function getCase(id: string): Promise<CaseWithRefs | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .select(
      'id, number_title, client_id, lawyer_id, responsible_id, opened_at, case_type, category, subject, stage, priority, tags, ' +
        'contract_sum, paid_total, debt, billing_types, lawyer_rate_override, expert_rate_override, accrual_mode, opponent, court_case_number, court, closed_at, created_at, ' +
        'client:client_id(id, name, client_kind), lawyer:lawyer_id(id, full_name), responsible:responsible_id(id, full_name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`getCase failed: ${error.message}`);
  }
  if (!data) return null;

  type Row = Omit<
    Case,
    'contract_sum' | 'paid_total' | 'debt' | 'lawyer_rate_override' | 'expert_rate_override'
  > & {
    contract_sum: number | string;
    paid_total: number | string;
    debt: number | string;
    lawyer_rate_override: number | string | null;
    expert_rate_override: number | string | null;
    client:
      | ReadonlyArray<{ id: string; name: string; client_kind: ClientKind }>
      | { id: string; name: string; client_kind: ClientKind }
      | null;
    lawyer:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
    responsible:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  const r = data as unknown as Row;
  const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
  const lawyer = Array.isArray(r.lawyer) ? (r.lawyer[0] ?? null) : r.lawyer;
  const responsible = Array.isArray(r.responsible)
    ? (r.responsible[0] ?? null)
    : r.responsible;

  return {
    id: r.id,
    number_title: r.number_title,
    client_id: r.client_id,
    lawyer_id: r.lawyer_id,
    responsible_id: r.responsible_id,
    opened_at: r.opened_at,
    case_type: r.case_type,
    category: r.category,
    subject: r.subject,
    stage: r.stage,
    priority: r.priority,
    tags: r.tags ?? [],
    contract_sum: Number(r.contract_sum),
    paid_total: Number(r.paid_total),
    debt: Number(r.debt),
    billing_types: (r.billing_types ?? []) as BillingType[],
    lawyer_rate_override:
      r.lawyer_rate_override == null ? null : Number(r.lawyer_rate_override),
    expert_rate_override:
      r.expert_rate_override == null ? null : Number(r.expert_rate_override),
    accrual_mode: r.accrual_mode,
    opponent: r.opponent,
    court_case_number: r.court_case_number,
    court: r.court,
    closed_at: r.closed_at,
    created_at: r.created_at,
    client,
    lawyer,
    responsible,
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
  contract_sum: number;
  debt: number;
  client: { id: string; name: string } | null;
  lawyer: { id: string; full_name: string } | null;
  responsible: { id: string; full_name: string } | null;
};

// На колонку — мягкий cap: больше 100 карточек в одну стадию не нужно показывать.
// При превышении страница покажет «+N ещё» в подвале колонки.
export const BOARD_COLUMN_CAP = 100;

// Все RLS-видимые дела для доски. Сортировка по приоритету (urgent сверху),
// затем по opened_at desc. Группировка — на клиенте.
export async function listCasesForBoard(params: {
  responsibleId?: string;
  caseType?: CaseType;
} = {}): Promise<BoardCaseItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('cases')
    .select(
      'id, number_title, stage, priority, case_type, category, opened_at, contract_sum, debt, ' +
        'client:client_id(id, name), lawyer:lawyer_id(id, full_name), responsible:responsible_id(id, full_name)',
    )
    // urgent сверху (priority='urgent' < 'normal' в алфавите → ascending=true)
    .order('priority', { ascending: true })
    .order('opened_at', { ascending: false })
    .order('id', { ascending: false });

  if (params.responsibleId) query = query.eq('responsible_id', params.responsibleId);
  if (params.caseType) query = query.eq('case_type', params.caseType);

  const { data, error } = await query;
  if (error) {
    throw new Error(`listCasesForBoard failed: ${error.message}`);
  }

  type Row = {
    id: string;
    number_title: string;
    stage: CaseStage;
    priority: CasePriority;
    case_type: CaseType;
    category: CaseCategory;
    opened_at: string;
    contract_sum: number | string;
    debt: number | string;
    client:
      | ReadonlyArray<{ id: string; name: string }>
      | { id: string; name: string }
      | null;
    lawyer:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
    responsible:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  return (data ?? []).map((row) => {
    const r = row as unknown as Row;
    const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
    const lawyer = Array.isArray(r.lawyer) ? (r.lawyer[0] ?? null) : r.lawyer;
    const responsible = Array.isArray(r.responsible)
      ? (r.responsible[0] ?? null)
      : r.responsible;
    return {
      id: r.id,
      number_title: r.number_title,
      stage: r.stage,
      priority: r.priority,
      case_type: r.case_type,
      category: r.category,
      opened_at: r.opened_at,
      contract_sum: Number(r.contract_sum),
      debt: Number(r.debt),
      client,
      lawyer,
      responsible,
    };
  });
}

export type AssigneeOption = {
  id: string;
  full_name: string;
};

// Список активных пользователей для выбора. RLS на users разрешает SELECT
// любому активному authenticated, поэтому сюда приходят все подходящие.
async function listUsersByRoles(roles: ReadonlyArray<string>): Promise<AssigneeOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name')
    .in('role', roles as string[])
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`listUsersByRoles failed: ${error.message}`);
  }
  return (data ?? []) as AssigneeOption[];
}

// Експерты-исполнители (responsible_id). owner/admin тоже могут вести дело.
export function listExpertsForAssignment(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['expert', 'admin', 'owner']);
}

// Юристы-продажники (lawyer_id). owner/admin тоже могут заключать договор.
export function listLawyersForAssignment(): Promise<AssigneeOption[]> {
  return listUsersByRoles(['lawyer', 'admin', 'owner']);
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
