import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { kyivTodayEndIso, kyivTodayStartIso } from '@/lib/tasks/queries';

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

// ── Бейдж колокольчика (2026-07-19, миграция 0005) ─────────────────────────
// Показывается, только если самое свежее «горящее» уведомление появилось ПОСЛЕ
// последнего открытия попапа. «Момент события» задачи: для просроченной — её
// due_at (момент, когда загорелась), для сегодняшней с due в будущем — начало
// киевского дня (утром впервые попала в срез «сегодня»); задача, созданная
// позже, — момент создания. Отметка просмотра —
// user_notify_channels.notifications_seen_at (пишет markNotificationsSeenAction).
export async function getNotificationsUnseen(userId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const uid = user.profile.id;
  const dayStart = kyivTodayStartIso();
  const dayEnd = kyivTodayEndIso();

  const [seenRow, evRows] = await Promise.all([
    userDb(uid, (tx) =>
      tx.user_notify_channels.findUnique({
        where: { user_id: userId },
        select: { notifications_seen_at: true },
      }),
    ),
    userDb(uid, (tx) =>
      tx.$queryRaw<Array<{ max_event: Date | null }>>`
        select max(greatest(
          created_at,
          case when due_at <= now() then due_at
               else ${dayStart}::timestamptz end
        )) as max_event
        from public.tasks
        where assignee_id = ${userId}::uuid
          and status = 'open'
          and due_at < ${dayEnd}::timestamptz`,
    ),
  ]);

  const maxEvent = evRows[0]?.max_event ?? null;
  if (!maxEvent) return false;
  const seenAt = seenRow?.notifications_seen_at ?? null;
  return seenAt === null || maxEvent.getTime() > seenAt.getTime();
}
