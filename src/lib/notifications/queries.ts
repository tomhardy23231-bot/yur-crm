import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';

// v3 Сессия 8: чтение канала уведомлений текущего пользователя. RLS self-select
// отдаёт только собственную строку; тянем по PK (user_id) под своей сессией.
export type NotifyChannel = {
  telegram_chat_id: string | null;
  telegram_link_code: string | null;
  calendar_token: string;
};

export async function getNotifyChannel(): Promise<NotifyChannel | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await userDb(user.profile.id, (tx) =>
    tx.user_notify_channels.findUnique({
      where: { user_id: user.profile.id },
      select: {
        telegram_chat_id: true,
        telegram_link_code: true,
        calendar_token: true,
      },
    }),
  );
  return row ?? null;
}
