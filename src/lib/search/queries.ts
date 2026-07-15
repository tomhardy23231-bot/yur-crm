import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { rpcSearchCaseIds } from '@/lib/db/rpc';
import {
  EMPTY_RESULTS,
  MAX_RESULTS_PER_GROUP,
  type PaletteResults,
  type CasePaletteItem,
  type ClientPaletteItem,
  type TaskPaletteItem,
  type DocumentPaletteItem,
} from '@/lib/search/types';

// Чистим ILIKE-wildcard'ы `%_` (Prisma `contains` их не экранирует) и прочие
// спецсимволы, чтобы «50%» не матчило как маска — как в cases/clients queries.
function sanitize(value: string): string {
  return value.replace(/[,()*'"\\%_]/g, '').trim();
}

// Глобальный поиск для Cmd+K. RLS отрежет невидимое автоматически —
// специалист увидит только свои дела/задачи + клиентов, привязанных к ним.
// 4 параллельных запроса, по 5 результатов в группе.
export async function searchEverything(q: string): Promise<PaletteResults> {
  const query = sanitize(q);
  if (query.length === 0) {
    return EMPTY_RESULTS;
  }

  const user = await getCurrentUser();
  if (!user) return EMPTY_RESULTS;
  const uid = user.profile.id;
  const like = { contains: query, mode: 'insensitive' as const };

  // QA M-001: для дел используем RPC search_case_ids, который ищет ещё и по
  // client.name + tags[] — иначе палитра не находит CRM-2026-001 по «Иванов»
  // (клиент) или по «imushestvo» (тег), а /cases?q= находит. Двух-этап:
  // (1) RPC для id'ов и порядка, (2) join для number_title + client.name.
  // Documents — ilike по file_name, RLS наследует от case.
  const [matchRows, clients, tasks, documents] = await Promise.all([
    userDb(uid, (tx) =>
      rpcSearchCaseIds(tx, { q: query, limit: MAX_RESULTS_PER_GROUP, offset: 0 }),
    ),
    userDb(uid, (tx) =>
      tx.clients.findMany({
        where: { name: like },
        orderBy: { name: 'asc' },
        take: MAX_RESULTS_PER_GROUP,
        select: { id: true, name: true, client_kind: true },
      }),
    ),
    userDb(uid, (tx) =>
      tx.tasks.findMany({
        where: { title: like },
        orderBy: { created_at: 'desc' },
        take: MAX_RESULTS_PER_GROUP,
        select: {
          id: true,
          title: true,
          case_id: true,
          status: true,
          cases: { select: { number_title: true } },
        },
      }),
    ),
    userDb(uid, (tx) =>
      tx.documents.findMany({
        where: { file_name: like },
        orderBy: { uploaded_at: 'desc' },
        take: MAX_RESULTS_PER_GROUP,
        select: {
          id: true,
          file_name: true,
          doc_type: true,
          case_id: true,
          cases: { select: { number_title: true } },
        },
      }),
    ),
  ]);

  // Дотягиваем полные ряды для найденных case_id (с join на client.name).
  const matchedIds = matchRows.map((r) => r.id);
  const caseRows = matchedIds.length
    ? await userDb(uid, (tx) =>
        tx.cases.findMany({
          where: { id: { in: matchedIds } },
          select: {
            id: true,
            number_title: true,
            stage: true,
            clients: { select: { name: true } },
          },
        }),
      )
    : [];

  // Восстанавливаем порядок из RPC (findMany возвращает в нативном порядке БД).
  const indexById = new Map(matchedIds.map((id, idx) => [id, idx]));
  const cases: CasePaletteItem[] = caseRows
    .map((r) => ({
      id: r.id,
      number_title: r.number_title,
      stage: r.stage as string,
      client_name: r.clients?.name ?? null,
    }))
    .sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));

  const clientItems: ClientPaletteItem[] = clients.map((r) => ({
    id: r.id,
    name: r.name,
    client_kind: r.client_kind as ClientPaletteItem['client_kind'],
  }));

  const taskItems: TaskPaletteItem[] = tasks.map((r) => ({
    id: r.id,
    title: r.title,
    case_id: r.case_id,
    case_number: r.cases?.number_title ?? null,
    status: r.status as TaskPaletteItem['status'],
  }));

  const documentItems: DocumentPaletteItem[] = documents.map((r) => ({
    id: r.id,
    file_name: r.file_name,
    doc_type: r.doc_type as DocumentPaletteItem['doc_type'],
    case_id: r.case_id,
    case_number: r.cases?.number_title ?? null,
  }));

  return {
    cases,
    clients: clientItems,
    tasks: taskItems,
    documents: documentItems,
  };
}
