import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildDigest,
  buildOverduePaymentsDigest,
  type DigestTask,
  type OverdueDigestItem,
} from '@/lib/notifications/digest';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import { kyivToday } from '@/lib/payroll/month';
import { coerceLocale } from '@/lib/i18n/config';
import type { TaskKind } from '@/lib/types/db';

export const dynamic = 'force-dynamic';

// v3 Сессия 8: ежедневная рассылка дайджеста задач в Telegram (cron, vercel.json).
//
// Машина-к-машине: авторизация по Bearer CRON_SECRET (исключён из auth-прокси).
// Работает через service_role (системная фоновая задача — допустимое применение
// в обход RLS, CLAUDE.md §2). buildDigest сам отбирает просрочено/сегодня/завтра
// по киевским датам — поэтому тянем задачи с запасом и фильтруем в нём.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Dry-run среда без настроенного бота — не падаем, честно сообщаем.
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false, reason: 'no token' });
  }

  const admin = createSupabaseAdminClient();

  const { data: channels, error: chErr } = await admin
    .from('user_notify_channels')
    .select('user_id, telegram_chat_id')
    .not('telegram_chat_id', 'is', null);
  if (chErr) {
    console.error('cron/reminders: channels query failed:', chErr.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!channels || channels.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const userIds = channels.map((c) => c.user_id as string);

  // Языки пользователей (одним запросом).
  const { data: users } = await admin
    .from('users')
    .select('id, language')
    .in('id', userIds);
  const langOf = new Map(
    (users ?? []).map((u) => [u.id as string, coerceLocale(u.language)]),
  );

  // Открытые задачи с дедлайном до конца завтрашнего дня (+запас 3 дня).
  const horizon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { data: rows, error: tErr } = await admin
    .from('tasks')
    .select('title, kind, due_at, assignee_id, case:case_id(number_title)')
    .in('assignee_id', userIds)
    .eq('status', 'open')
    .not('due_at', 'is', null)
    .lt('due_at', horizon);
  if (tErr) {
    console.error('cron/reminders: tasks query failed:', tErr.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  type Row = {
    title: string;
    kind: TaskKind;
    due_at: string;
    assignee_id: string;
    case: { number_title: string } | { number_title: string }[] | null;
  };
  const byUser = new Map<string, DigestTask[]>();
  for (const r of (rows ?? []) as Row[]) {
    const caseRef = Array.isArray(r.case) ? r.case[0] : r.case;
    const list = byUser.get(r.assignee_id) ?? [];
    list.push({
      title: r.title,
      kind: r.kind,
      due_at: r.due_at,
      caseTitle: caseRef?.number_title ?? null,
    });
    byUser.set(r.assignee_id, list);
  }

  // v3 Сессия 9: просроченные доплаты по делам юриста. Тот же RPC overdue_plan_items,
  // но под admin (service_role) он отдаёт ВСЁ (RLS обойдена) — группируем по
  // lawyer_id дела сами. Best-effort: сбой не должен ронять задачный дайджест.
  const overdueByLawyer = new Map<string, OverdueDigestItem[]>();
  const { data: overdueRows, error: oErr } = await admin.rpc('overdue_plan_items', {
    p_today: kyivToday(),
  });
  if (oErr) {
    console.error('cron/reminders: overdue query failed:', oErr.message);
  } else if (overdueRows && overdueRows.length > 0) {
    type OverRow = {
      case_id: string;
      number_title: string;
      due_date: string;
      amount: number | string;
      paid_total: number | string;
      plan_before: number | string;
    };
    // plan_before — накопленная сумма плана ВКЛЮЧАЯ позицию; непокрытая часть =
    // clamp(plan_before − paid_total, 0, amount).
    const real = (overdueRows as OverRow[])
      .map((r) => {
        const amount = Number(r.amount);
        const shortfall =
          Math.round(
            (Math.min(amount, Math.max(0, Number(r.plan_before) - Number(r.paid_total))) +
              Number.EPSILON) *
              100,
          ) / 100;
        return { caseId: r.case_id, numberTitle: r.number_title, dueDate: r.due_date, shortfall };
      })
      .filter((r) => r.shortfall > 0);

    if (real.length > 0) {
      // Карта дело → юрист (только для просроченных дел).
      const caseIds = [...new Set(real.map((r) => r.caseId))];
      const { data: caseRows } = await admin
        .from('cases')
        .select('id, lawyer_id')
        .in('id', caseIds);
      const lawyerOf = new Map(
        (caseRows ?? []).map((c) => [c.id as string, c.lawyer_id as string | null]),
      );
      for (const r of real) {
        const lawyerId = lawyerOf.get(r.caseId);
        if (!lawyerId) continue;
        const list = overdueByLawyer.get(lawyerId) ?? [];
        list.push({ numberTitle: r.numberTitle, dueDate: r.dueDate, shortfall: r.shortfall });
        overdueByLawyer.set(lawyerId, list);
      }
    }
  }

  let sent = 0;
  for (const ch of channels) {
    const uid = ch.user_id as string;
    const lang = langOf.get(uid) ?? 'uk';
    const taskText = buildDigest(byUser.get(uid) ?? [], lang);
    const overdueText = buildOverduePaymentsDigest(overdueByLawyer.get(uid) ?? [], lang);
    const text = [taskText, overdueText].filter(Boolean).join('\n\n');
    if (!text) continue;
    const ok = await sendTelegramMessage(ch.telegram_chat_id as string, text);
    if (ok) sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
