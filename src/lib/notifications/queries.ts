import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

// v3 Сессия 8: чтение канала уведомлений текущего пользователя. RLS self-select
// отдаёт только собственную строку — фильтр по user_id не нужен.
export type NotifyChannel = {
  telegram_chat_id: string | null;
  telegram_link_code: string | null;
  calendar_token: string;
};

export async function getNotifyChannel(): Promise<NotifyChannel | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_notify_channels')
    .select('telegram_chat_id, telegram_link_code, calendar_token')
    .maybeSingle();
  if (error) {
    console.error('getNotifyChannel:', error.message);
    return null;
  }
  return (data as NotifyChannel | null) ?? null;
}
