import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

export const dynamic = 'force-dynamic';

// v3 Сессия 8: вебхук Telegram-бота. Привязка чата к пользователю по коду.
//
// Машина-к-машине: у Telegram нет нашей сессии — авторизация ТОЛЬКО по секретному
// заголовку (его Telegram шлёт, если задать secret_token при setWebhook). Роут
// исключён из auth-прокси (см. proxy.ts). ВСЕГДА отвечаем 200, иначе Telegram
// бесконечно ретраит апдейт.
type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token');
  // Секрет обязателен: без него любой смог бы привязать чужой чат. Не настроен →
  // не принимаем вовсе.
  if (!secret || got !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text?.trim() ?? '';
  const chatId = update.message?.chat?.id;
  const code = /^\/start\s+(\S+)$/.exec(text)?.[1];

  if (code && chatId != null) {
    const admin = createSupabaseAdminClient();
    const { data: row } = await admin
      .from('user_notify_channels')
      .select('user_id')
      .eq('telegram_link_code', code)
      .maybeSingle();

    if (row) {
      // Привязываем чат и гасим одноразовый код.
      await admin
        .from('user_notify_channels')
        .update({
          telegram_chat_id: String(chatId),
          telegram_link_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', row.user_id);
      await sendTelegramMessage(String(chatId), 'Готово ✅ Уведомления подключены.');
    } else {
      await sendTelegramMessage(
        String(chatId),
        'Код не найден или уже использован. Сгенерируйте новый в профиле.',
      );
    }
  }

  return NextResponse.json({ ok: true });
}
