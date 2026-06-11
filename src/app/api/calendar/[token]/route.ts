import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { buildIcs, type IcsEvent } from '@/lib/calendar/ics';
import { taskKindLabel } from '@/lib/notifications/digest';
import { coerceLocale } from '@/lib/i18n/config';
import type { TaskKind } from '@/lib/types/db';
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

  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin
    .from('user_notify_channels')
    .select('user_id')
    .eq('calendar_token', token)
    .maybeSingle();
  if (!channel) {
    return new Response('Not found', { status: 404 });
  }

  const { data: userRow } = await admin
    .from('users')
    .select('language')
    .eq('id', channel.user_id)
    .maybeSingle();
  const lang = coerceLocale(userRow?.language);

  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 60 * 86_400_000).toISOString();
  const { data: rows } = await admin
    .from('tasks')
    .select('id, title, kind, due_at, case:case_id(number_title)')
    .eq('assignee_id', channel.user_id)
    .eq('status', 'open')
    .not('due_at', 'is', null)
    .gte('due_at', from)
    .lte('due_at', to);

  type Row = {
    id: string;
    title: string;
    kind: TaskKind;
    due_at: string;
    case: { number_title: string } | { number_title: string }[] | null;
  };
  const events: IcsEvent[] = ((rows ?? []) as Row[]).map((r) => {
    const caseRef = Array.isArray(r.case) ? r.case[0] : r.case;
    const kind = taskKindLabel(r.kind, lang);
    const summary = caseRef?.number_title
      ? `${kind}: ${caseRef.number_title} — ${r.title}`
      : `${kind}: ${r.title}`;
    return { uid: r.id, start: r.due_at, summary };
  });

  return new Response(buildIcs(events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
