'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { rpcNotifyReissueCalendarToken } from '@/lib/db/rpc';

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
  const code = crypto.randomUUID().slice(0, 8);

  try {
    await userDb(user.profile.id, (tx) =>
      tx.user_notify_channels.upsert({
        where: { user_id: user.profile.id },
        create: {
          user_id: user.profile.id,
          telegram_link_code: code,
          telegram_chat_id: null,
        },
        update: {
          telegram_link_code: code,
          telegram_chat_id: null,
          updated_at: new Date(),
        },
      }),
    );
  } catch (err) {
    console.error('linkTelegramAction:', err);
    return { ok: false, error: String(err) };
  }
  revalidatePath('/profile');
  return { ok: true, code };
}

// Отвязать Telegram: убираем chat_id и код. updateMany — тихий no-op, если своей
// строки ещё нет (RLS self отдаёт только её).
export async function unlinkTelegramAction(): Promise<NotifyActionState> {
  const user = await requireUser();
  try {
    await userDb(user.profile.id, (tx) =>
      tx.user_notify_channels.updateMany({
        where: { user_id: user.profile.id },
        data: {
          telegram_chat_id: null,
          telegram_link_code: null,
          updated_at: new Date(),
        },
      }),
    );
  } catch (err) {
    console.error('unlinkTelegramAction:', err);
    return { ok: false, error: String(err) };
  }
  revalidatePath('/profile');
  return { ok: true };
}

// Создать/перевыпустить токен ICS-фида. Случайность берётся В БД (RPC
// notify_reissue_calendar_token, gen_random_uuid), не в JS — см. миграцию.
export async function reissueCalendarTokenAction(): Promise<NotifyActionState> {
  const user = await requireUser();
  try {
    const token = await userDb(user.profile.id, (tx) =>
      rpcNotifyReissueCalendarToken(tx),
    );
    revalidatePath('/profile');
    return { ok: true, token };
  } catch (err) {
    console.error('reissueCalendarTokenAction:', err);
    return { ok: false, error: String(err) };
  }
}
