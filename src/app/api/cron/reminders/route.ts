import { NextResponse } from 'next/server';

import { adminDb } from '@/lib/db/admin';
import { ts } from '@/lib/db/convert';
import { rpcOverduePlanItems } from '@/lib/db/rpc';
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
// Работает через admin-пул (owner БД, системная фоновая задача — допустимое
// применение в обход RLS, CLAUDE.md §2). buildDigest сам отбирает
// просрочено/сегодня/завтра по киевским датам — поэтому тянем задачи с запасом.
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

  const admin = adminDb();

  let channels: Array<{ user_id: string; telegram_chat_id: string | null }>;
  try {
    channels = await admin.user_notify_channels.findMany({
      where: { telegram_chat_id: { not: null } },
      select: { user_id: true, telegram_chat_id: true },
    });
  } catch (err) {
    console.error('cron/reminders: channels query failed:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (channels.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const userIds = channels.map((c) => c.user_id);

  // Языки пользователей (одним запросом).
  const users = await admin.public_users.findMany({
    where: { id: { in: userIds } },
    select: { id: true, language: true },
  });
  const langOf = new Map(users.map((u) => [u.id, coerceLocale(u.language)]));

  // Открытые задачи с дедлайном до конца завтрашнего дня (+запас 3 дня).
  const horizon = new Date(Date.now() + 3 * 86_400_000);
  let rows: Array<{
    title: string;
    kind: TaskKind;
    due_at: Date | null;
    assignee_id: string;
    cases: { number_title: string } | null;
  }>;
  try {
    rows = await admin.tasks.findMany({
      where: {
        assignee_id: { in: userIds },
        status: 'open',
        due_at: { not: null, lt: horizon },
      },
      select: {
        title: true,
        kind: true,
        due_at: true,
        assignee_id: true,
        cases: { select: { number_title: true } },
      },
    });
  } catch (err) {
    console.error('cron/reminders: tasks query failed:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const byUser = new Map<string, DigestTask[]>();
  for (const r of rows) {
    if (!r.due_at) continue;
    const list = byUser.get(r.assignee_id) ?? [];
    list.push({
      title: r.title,
      kind: r.kind,
      due_at: ts(r.due_at),
      caseTitle: r.cases?.number_title ?? null,
    });
    byUser.set(r.assignee_id, list);
  }

  // v3 Сессия 9: просроченные доплаты по делам юриста. RPC overdue_plan_items под
  // admin (owner) отдаёт ВСЁ (RLS обойдена) — группируем по lawyer_id дела сами.
  // Best-effort: сбой не должен ронять задачный дайджест.
  const overdueByLawyer = new Map<string, OverdueDigestItem[]>();
  try {
    const overdueRows = await rpcOverduePlanItems(admin, { today: kyivToday() });
    // plan_before — накопленная сумма плана ВКЛЮЧАЯ позицию; непокрытая часть =
    // clamp(plan_before − paid_total, 0, amount).
    const real = overdueRows
      .map((r) => {
        const shortfall =
          Math.round(
            (Math.min(r.amount, Math.max(0, r.plan_before - r.paid_total)) +
              Number.EPSILON) *
              100,
          ) / 100;
        return {
          caseId: r.case_id,
          numberTitle: r.number_title,
          dueDate: r.due_date,
          shortfall,
        };
      })
      .filter((r) => r.shortfall > 0);

    if (real.length > 0) {
      // Карта дело → юрист (только для просроченных дел).
      const caseIds = [...new Set(real.map((r) => r.caseId))];
      const caseRows = await admin.cases.findMany({
        where: { id: { in: caseIds } },
        select: { id: true, lawyer_id: true },
      });
      const lawyerOf = new Map(caseRows.map((c) => [c.id, c.lawyer_id]));
      for (const r of real) {
        const lawyerId = lawyerOf.get(r.caseId);
        if (!lawyerId) continue;
        const list = overdueByLawyer.get(lawyerId) ?? [];
        list.push({ numberTitle: r.numberTitle, dueDate: r.dueDate, shortfall: r.shortfall });
        overdueByLawyer.set(lawyerId, list);
      }
    }
  } catch (err) {
    console.error('cron/reminders: overdue query failed:', err);
  }

  let sent = 0;
  for (const ch of channels) {
    if (!ch.telegram_chat_id) continue;
    const uid = ch.user_id;
    const lang = langOf.get(uid) ?? 'uk';
    const taskText = buildDigest(byUser.get(uid) ?? [], lang);
    const overdueText = buildOverduePaymentsDigest(overdueByLawyer.get(uid) ?? [], lang);
    const text = [taskText, overdueText].filter(Boolean).join('\n\n');
    if (!text) continue;
    const ok = await sendTelegramMessage(ch.telegram_chat_id, text);
    if (ok) sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
