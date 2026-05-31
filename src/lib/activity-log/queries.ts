import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, entity_type, entity_id, action, changes, created_at, ' +
        'user:user_id(id, full_name)',
    )
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listCaseActivity failed: ${error.message}`);
  }

  type Row = {
    id: number;
    entity_type: string;
    entity_id: string;
    action: string;
    changes: ActivityChanges | null;
    created_at: string;
    user:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  return (data ?? []).map((row) => {
    const r = row as unknown as Row;
    const user = Array.isArray(r.user) ? (r.user[0] ?? null) : r.user;
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      changes: r.changes,
      created_at: r.created_at,
      user,
    };
  });
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

  const supabase = await createSupabaseServerClient();

  if (userIds.length > 0) {
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds as string[]);
    for (const u of (data ?? []) as Array<{ id: string; full_name: string }>) {
      map.set(u.id, u.full_name);
    }
  }

  if (clientIds.length > 0) {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds as string[]);
    for (const c of (data ?? []) as Array<{ id: string; name: string }>) {
      map.set(c.id, c.name);
    }
  }

  return map;
}
