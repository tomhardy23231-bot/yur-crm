import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';

export type ActivityChanges = Record<string, unknown>;

export type ActivityLogEntry = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: ActivityChanges | null;
  created_at: string;
  user: { id: string; full_name: string } | null;
};

// Журнал событий по делу (entity_type='case', entity_id=caseId).
// Все «дочерние» события (документы/задачи/платежи) логируем под case'ом —
// см. конвенцию в 20260527110000_activity_log_writer.sql.
// RLS уже фильтрует: SELECT доступен через activity_log_select_visible.
export async function listCaseActivity(
  caseId: string,
  limit: number = 20,
): Promise<ActivityLogEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.activity_log.findMany({
      where: { entity_type: 'case', entity_id: caseId },
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

  return rows.map((r) => ({
    id: Number(r.id),
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    action: r.action,
    changes: (r.changes as ActivityChanges | null) ?? null,
    created_at: ts(r.created_at),
    user: r.users ? { id: r.users.id, full_name: r.users.full_name } : null,
  }));
}

// Резолв UUID пользователей/клиентов в имена для журнала (Задача 3): чтобы в
// истории показывать имена, а не «1025f252… → e1faf739…». Один батч-запрос на
// users и один на clients. RLS режет невидимое (имя просто не найдётся —
// formatActivity мягко покажет усечённый id). Возвращает общую карту id → имя.
export async function resolveActivityNames(
  userIds: ReadonlyArray<string>,
  clientIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0 && clientIds.length === 0) return map;

  const currentUser = await getCurrentUser();
  if (!currentUser) return map;
  const uid = currentUser.profile.id;

  const [users, clients] = await Promise.all([
    userIds.length > 0
      ? userDb(uid, (tx) =>
          tx.public_users.findMany({
            where: { id: { in: userIds as string[] } },
            select: { id: true, full_name: true },
          }),
        )
      : Promise.resolve([]),
    clientIds.length > 0
      ? userDb(uid, (tx) =>
          tx.clients.findMany({
            where: { id: { in: clientIds as string[] } },
            select: { id: true, name: true },
          }),
        )
      : Promise.resolve([]),
  ]);

  for (const u of users) map.set(u.id, u.full_name);
  for (const c of clients) map.set(c.id, c.name);

  return map;
}
