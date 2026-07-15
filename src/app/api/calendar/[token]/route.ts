import { adminDb } from '@/lib/db/admin';
import { ts } from '@/lib/db/convert';
import { buildIcs, type IcsEvent } from '@/lib/calendar/ics';
import { taskKindLabel } from '@/lib/notifications/digest';
import { coerceLocale } from '@/lib/i18n/config';
import { UUID_RE } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// v3 Сессия 8: ICS-фид задач пользователя для подписки в телефоне/календаре.
//
// URL вида /api/calendar/<uuid>.ics — токен В URL и есть аутентификация (стандарт
// для календарных подписок: клиенты не умеют слать заголовки). Роут исключён из
// auth-прокси; читает через service_role по calendar_token. Перевыпуск токена в
// профиле инвалидирует старую ссылку.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = rawToken.replace(/\.ics$/i, '');
  if (!UUID_RE.test(token)) {
    return new Response('Not found', { status: 404 });
  }

  const admin = adminDb();
  const channel = await admin.user_notify_channels.findFirst({
    where: { calendar_token: token },
    select: { user_id: true },
  });
  if (!channel) {
    return new Response('Not found', { status: 404 });
  }

  const userRow = await admin.public_users.findUnique({
    where: { id: channel.user_id },
    select: { language: true },
  });
  const lang = coerceLocale(userRow?.language);

  const from = new Date(Date.now() - 7 * 86_400_000);
  const to = new Date(Date.now() + 60 * 86_400_000);
  const rows = await admin.tasks.findMany({
    where: {
      assignee_id: channel.user_id,
      status: 'open',
      due_at: { not: null, gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      kind: true,
      due_at: true,
      cases: { select: { number_title: true } },
    },
  });

  const events: IcsEvent[] = rows.map((r) => {
    const kind = taskKindLabel(r.kind, lang);
    const summary = r.cases?.number_title
      ? `${kind}: ${r.cases.number_title} — ${r.title}`
      : `${kind}: ${r.title}`;
    return { uid: r.id, start: ts(r.due_at), summary };
  });

  return new Response(buildIcs(events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
