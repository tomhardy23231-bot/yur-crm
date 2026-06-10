import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

// Контракт совпадает с public.log_activity(text, uuid, text, jsonb) в БД.
// SECURITY DEFINER + проверки видимости — см. 20260527110000_activity_log_writer.sql.
//
// ВАЖНО: эта функция НИКОГДА не должна выбрасывать исключение наружу —
// логирование вторично, не должно ломать основной серверный action.
// Ошибки заглушаются и пишутся в console.error.
export type ActivityEntityType = 'case' | 'client' | 'user' | 'department';

export type LogActivityInput = {
  entity_type: ActivityEntityType;
  entity_id: string;
  action: string;
  changes?: Record<string, unknown> | null;
};

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('log_activity', {
      p_entity_type: input.entity_type,
      p_entity_id: input.entity_id,
      p_action: input.action,
      p_changes: input.changes ?? null,
    });
    if (error) {
      console.error('[activity-log] rpc.log_activity failed:', error.message);
    }
  } catch (err) {
    console.error('[activity-log] logActivity threw:', err);
  }
}
