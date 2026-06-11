'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// v3 Сессия 8: управление каналами уведомлений из профиля. Всё под сессией
// пользователя (RLS self) — трогаем только свою строку user_notify_channels.

export type NotifyActionState = {
  ok: boolean;
  code?: string; // одноразовый код привязки Telegram
  token?: string; // новый calendar_token
  error?: string;
};

// Привязать Telegram: генерируем одноразовый код и кладём его в свою строку.
// chat_id зануляем (на случай повторной привязки). Сам chat_id впишет вебхук по /start.
export async function linkTelegramAction(): Promise<NotifyActionState> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const code = crypto.randomUUID().slice(0, 8);

  const { error } = await supabase.from('user_notify_channels').upsert(
    {
      user_id: user.profile.id,
      telegram_link_code: code,
      telegram_chat_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('linkTelegramAction:', error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath('/profile');
  return { ok: true, code };
}

// Отвязать Telegram: убираем chat_id и код.
export async function unlinkTelegramAction(): Promise<NotifyActionState> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('user_notify_channels')
    .update({
      telegram_chat_id: null,
      telegram_link_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.profile.id);
  if (error) {
    console.error('unlinkTelegramAction:', error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath('/profile');
  return { ok: true };
}

// Создать/перевыпустить токен ICS-фида. Случайность берётся В БД (RPC
// notify_reissue_calendar_token, gen_random_uuid), не в JS — см. миграцию.
export async function reissueCalendarTokenAction(): Promise<NotifyActionState> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('notify_reissue_calendar_token');
  if (error || !data) {
    console.error('reissueCalendarTokenAction:', error?.message);
    return { ok: false, error: error?.message };
  }
  revalidatePath('/profile');
  return { ok: true, token: data as string };
}
