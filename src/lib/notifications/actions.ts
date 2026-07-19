'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { getOverduePayments } from '@/lib/dashboard/queries';
import { userDb } from '@/lib/db';
import { tsOrNull } from '@/lib/db/convert';
import { rpcNotifyReissueCalendarToken } from '@/lib/db/rpc';
import { kyivTodayEndIso } from '@/lib/tasks/queries';
import type { TaskKind } from '@/lib/types/db';

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

// ── Попап уведомлений колокольчика (2026-07-19) ────────────────────────────

// Отметить уведомления просмотренными: открытие попапа пишет now() в свою
// строку (self-RLS) — бейдж скрыт, пока не появится более свежее событие
// (getNotificationsUnseen). Fire-and-forget: страницу не ревалидируем,
// клиент прячет бейдж локально.
export async function markNotificationsSeenAction(): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  try {
    await userDb(user.profile.id, (tx) =>
      tx.user_notify_channels.upsert({
        where: { user_id: user.profile.id },
        create: { user_id: user.profile.id, notifications_seen_at: now },
        update: { notifications_seen_at: now, updated_at: now },
      }),
    );
  } catch (err) {
    console.error('markNotificationsSeenAction:', err);
  }
}

// Содержимое попапа: мои горящие задачи (просроченные + сегодняшние) и
// просроченные плановые платежи видимых дел (RLS: staff — все, юрист/Експерт —
// свои; переиспользуем getOverduePayments дашборда). Грузится лениво при
// открытии попапа — layout эти списки не тянет.
export type NotificationTaskItem = {
  id: string;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  caseId: string | null;
  caseTitle: string | null;
};

export type NotificationPaymentItem = {
  caseId: string;
  numberTitle: string;
  dueDate: string; // 'YYYY-MM-DD'
  shortfall: number;
};

export type NotificationsPayload = {
  overdue: NotificationTaskItem[];
  today: NotificationTaskItem[];
  payments: NotificationPaymentItem[];
};

const NOTIF_TASK_SELECT = {
  id: true,
  title: true,
  kind: true,
  due_at: true,
  cases: { select: { id: true, number_title: true } },
} as const;

type NotifTaskRow = {
  id: string;
  title: string;
  kind: TaskKind;
  due_at: Date | null;
  cases: { id: string; number_title: string } | null;
};

function toNotifTask(r: NotifTaskRow): NotificationTaskItem {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    dueAt: tsOrNull(r.due_at),
    caseId: r.cases?.id ?? null,
    caseTitle: r.cases?.number_title ?? null,
  };
}

export async function loadNotificationsAction(): Promise<NotificationsPayload> {
  const user = await requireUser();
  const uid = user.profile.id;
  const now = new Date();
  const dayEnd = new Date(kyivTodayEndIso());

  try {
    const [overdue, today, payments] = await Promise.all([
      userDb(uid, (tx) =>
        tx.tasks.findMany({
          where: { assignee_id: uid, status: 'open', due_at: { lt: now } },
          orderBy: { due_at: 'desc' },
          take: 7,
          select: NOTIF_TASK_SELECT,
        }),
      ),
      userDb(uid, (tx) =>
        tx.tasks.findMany({
          where: {
            assignee_id: uid,
            status: 'open',
            due_at: { gte: now, lt: dayEnd },
          },
          orderBy: { due_at: 'asc' },
          take: 7,
          select: NOTIF_TASK_SELECT,
        }),
      ),
      getOverduePayments(5),
    ]);

    return {
      overdue: (overdue as NotifTaskRow[]).map(toNotifTask),
      today: (today as NotifTaskRow[]).map(toNotifTask),
      payments: payments.map((p) => ({
        caseId: p.caseId,
        numberTitle: p.numberTitle,
        dueDate: p.dueDate,
        shortfall: p.shortfall,
      })),
    };
  } catch (err) {
    console.error('loadNotificationsAction:', err);
    return { overdue: [], today: [], payments: [] };
  }
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
