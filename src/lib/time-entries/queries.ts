import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CaseTimeAggregate,
  TimeEntryRow,
  TimeEntryWithRefs,
} from '@/lib/types/db';

// =====================================================================
// listTimeEntriesByCase — для блока «Учёт времени» на карточке дела.
// Сортировка: spent_at desc, created_at desc (свежее сверху).
// =====================================================================
export async function listTimeEntriesByCase(
  caseId: string,
): Promise<TimeEntryWithRefs[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('time_entries')
    .select(
      'id, case_id, task_id, user_id, spent_at, minutes, billable, hourly_rate, note, invoice_id, created_at, updated_at, ' +
        'user:user_id(id, full_name), task:task_id(id, title)',
    )
    .eq('case_id', caseId)
    .order('spent_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`listTimeEntriesByCase failed: ${error.message}`);
  return normalize(data ?? []).map((e) => ({ ...e, case: null }));
}

// =====================================================================
// getCaseTimeAggregate — KPI для блока «Финансы»:
//   - total_minutes / billable_minutes
//   - billable_amount = Σ (m/60 × rate) по entries с rate != null
//   - entries_count
// Считаем в TS — на Phase 1-объёмах (сотни entries на дело) ок;
// в Phase 2/B при инвойсах перенесём в SQL view или generated columns.
// =====================================================================
export async function getCaseTimeAggregate(
  caseId: string,
): Promise<CaseTimeAggregate> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('time_entries')
    .select('minutes, billable, hourly_rate')
    .eq('case_id', caseId);

  if (error) throw new Error(`getCaseTimeAggregate failed: ${error.message}`);

  type Row = { minutes: number; billable: boolean; hourly_rate: number | string | null };
  const rows = (data ?? []) as Row[];

  let total = 0;
  let billable = 0;
  let amount = 0;
  for (const r of rows) {
    total += r.minutes;
    if (r.billable) {
      billable += r.minutes;
      if (r.hourly_rate != null) {
        amount += (r.minutes / 60) * Number(r.hourly_rate);
      }
    }
  }

  return {
    total_minutes: total,
    billable_minutes: billable,
    billable_amount: Math.round(amount * 100) / 100,
    entries_count: rows.length,
  };
}

// =====================================================================
// listMyTimeEntries — личный экран /time.
// RLS отрежет невидимые автоматически; фильтр по user_id = active_uid
// дублируем явно для предсказуемой пагинации (admin/owner иначе видел бы
// все entries всех сотрудников, что для «мои часы» не имеет смысла).
//
// Параметры:
//   - userId   — обязателен (page контролируется текущим пользователем).
//   - dateFrom / dateTo — ISO date, оба inclusive.
//   - caseId   — optional фильтр.
//   - billable — optional фильтр (true / false).
// =====================================================================

export const TIME_PAGE_SIZE = 30;

export type ListMyTimeParams = {
  userId: string;
  dateFrom?: string;
  dateTo?: string;
  caseId?: string;
  billable?: boolean;
  page?: number;
};

export type ListMyTimeResult = {
  items: TimeEntryWithRefs[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listMyTimeEntries(
  params: ListMyTimeParams,
): Promise<ListMyTimeResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * TIME_PAGE_SIZE;

  let query = supabase
    .from('time_entries')
    .select(
      'id, case_id, task_id, user_id, spent_at, minutes, billable, hourly_rate, note, invoice_id, created_at, updated_at, ' +
        'user:user_id(id, full_name), case:case_id(id, number_title), task:task_id(id, title)',
      { count: 'exact' },
    )
    .eq('user_id', params.userId)
    .order('spent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + TIME_PAGE_SIZE - 1);

  if (params.dateFrom) query = query.gte('spent_at', params.dateFrom);
  if (params.dateTo) query = query.lte('spent_at', params.dateTo);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  if (params.billable !== undefined) query = query.eq('billable', params.billable);

  const { data, error, count } = await query;
  if (error) throw new Error(`listMyTimeEntries failed: ${error.message}`);

  const total = count ?? 0;
  return {
    items: normalize(data ?? []),
    total,
    page,
    pageSize: TIME_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / TIME_PAGE_SIZE)),
  };
}

// =====================================================================
// helpers
// =====================================================================

type RawRow = Omit<TimeEntryRow, 'hourly_rate'> & {
  hourly_rate: number | string | null;
  user:
    | ReadonlyArray<{ id: string; full_name: string }>
    | { id: string; full_name: string }
    | null;
  case:
    | ReadonlyArray<{ id: string; number_title: string }>
    | { id: string; number_title: string }
    | null;
  task:
    | ReadonlyArray<{ id: string; title: string }>
    | { id: string; title: string }
    | null;
};

function normalize(rows: ReadonlyArray<unknown>): TimeEntryWithRefs[] {
  return rows.map((row) => {
    const r = row as RawRow;
    const user = Array.isArray(r.user) ? (r.user[0] ?? null) : r.user;
    const c = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
    const t = Array.isArray(r.task) ? (r.task[0] ?? null) : r.task;
    return {
      id: r.id,
      case_id: r.case_id,
      task_id: r.task_id,
      user_id: r.user_id,
      spent_at: r.spent_at,
      minutes: r.minutes,
      billable: r.billable,
      hourly_rate: r.hourly_rate == null ? null : Number(r.hourly_rate),
      note: r.note,
      invoice_id: r.invoice_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user,
      case: c,
      task: t,
    };
  });
}
