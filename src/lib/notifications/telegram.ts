import 'server-only';

// v3 Сессия 8: тонкая обёртка над Telegram Bot API. Без сторонних библиотек —
// только fetch к публичному HTTP-эндпоинту бота (требование плана). Если токен
// не задан (dry-run среда без настроенного бота) — тихо пропускаем, не падаем.
export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('sendTelegramMessage: Telegram API returned', res.status);
    }
    return res.ok;
  } catch (e) {
    console.error('sendTelegramMessage failed:', e);
    return false;
  }
}
