import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  EMPTY_RESULTS,
  MAX_RESULTS_PER_GROUP,
  type PaletteResults,
  type CasePaletteItem,
  type ClientPaletteItem,
  type TaskPaletteItem,
} from '@/lib/search/types';

// PostgREST .or() — экранируем `,()*'"\%` от operator-injection
// (та же логика, что в cases/queries.ts:18 и clients/queries.ts).
function sanitize(value: string): string {
  return value.replace(/[,()*'"\\%]/g, '').trim();
}

// Глобальный поиск для Cmd+K. RLS отрежет невидимое автоматически —
// специалист увидит только свои дела/задачи + клиентов, привязанных к ним.
// 3 параллельных запроса, по 5 результатов в группе.
export async function searchEverything(q: string): Promise<PaletteResults> {
  const query = sanitize(q);
  if (query.length === 0) {
    return EMPTY_RESULTS;
  }

  const supabase = await createSupabaseServerClient();
  const pattern = `%${query}%`;

  // QA M-001: для дел используем RPC search_case_ids, который ищет ещё и по
  // client.name + tags[] — иначе палитра не находит CRM-2026-001 по «Иванов»
  // (клиент) или по «imushestvo» (тег), а /cases?q= находит. Двух-этап:
  // (1) RPC для id'ов и порядка, (2) embedded join для number_title + client.name.
  const [matchRowsRes, clientsRes, tasksRes] = await Promise.all([
    supabase.rpc('search_case_ids', {
      p_q: query,
      p_limit: MAX_RESULTS_PER_GROUP,
      p_offset: 0,
    }),
    supabase
      .from('clients')
      .select('id, name, client_kind')
      .ilike('name', pattern)
      .order('name', { ascending: true })
      .limit(MAX_RESULTS_PER_GROUP),
    supabase
      .from('tasks')
      .select('id, title, case_id, status, case:case_id(number_title)')
      .ilike('title', pattern)
      .order('created_at', { ascending: false })
      .limit(MAX_RESULTS_PER_GROUP),
  ]);

  // Дотягиваем полные ряды для найденных case_id (с PostgREST-join на client.name).
  type MatchRow = { id: string; total: number | string };
  const matchedIds = ((matchRowsRes.data ?? []) as MatchRow[]).map((r) => r.id);
  const casesRes =
    matchedIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('cases')
          .select('id, number_title, stage, client:client_id(name)')
          .in('id', matchedIds);

  type CaseRow = {
    id: string;
    number_title: string;
    stage: string;
    client:
      | ReadonlyArray<{ name: string }>
      | { name: string }
      | null;
  };
  type ClientRow = {
    id: string;
    name: string;
    client_kind: 'individual' | 'company';
  };
  type TaskRow = {
    id: string;
    title: string;
    case_id: string;
    status: 'open' | 'done';
    case:
      | ReadonlyArray<{ number_title: string }>
      | { number_title: string }
      | null;
  };

  // Восстанавливаем порядок из RPC (.in возвращает в нативном порядке БД).
  const indexById = new Map(matchedIds.map((id, idx) => [id, idx]));
  const cases: CasePaletteItem[] = (casesRes.data ?? [])
    .map((row) => {
      const r = row as unknown as CaseRow;
      const client = Array.isArray(r.client) ? (r.client[0] ?? null) : r.client;
      return {
        id: r.id,
        number_title: r.number_title,
        stage: r.stage,
        client_name: client?.name ?? null,
      };
    })
    .sort(
      (a, b) =>
        (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0),
    );

  const clients: ClientPaletteItem[] = (clientsRes.data ?? []).map((row) => {
    const r = row as unknown as ClientRow;
    return { id: r.id, name: r.name, client_kind: r.client_kind };
  });

  const tasks: TaskPaletteItem[] = (tasksRes.data ?? []).map((row) => {
    const r = row as unknown as TaskRow;
    const caseRef = Array.isArray(r.case) ? (r.case[0] ?? null) : r.case;
    return {
      id: r.id,
      title: r.title,
      case_id: r.case_id,
      case_number: caseRef?.number_title ?? null,
      status: r.status,
    };
  });

  return { cases, clients, tasks };
}
