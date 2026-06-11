// v3 Сессия 8: генерация ICS-фида (iCalendar, RFC 5545) для подписки в телефоне.
//
// Чистая логика (юнит-тестируется). Требования RFC, на которых легко споткнуться:
//   • строки разделяются CRLF (\r\n), не \n;
//   • в текстовых полях экранируются \\ , ; и перевод строки → \\n;
//   • DTSTART/DTSTAMP — UTC basic format YYYYMMDDTHHMMSSZ;
//   • DTSTAMP обязателен; VERSION/PRODID/CALSCALE — на уровне календаря.

export type IcsEvent = {
  uid: string; // обычно id задачи; @yurcase добавляется здесь
  start: string; // ISO timestamp (UTC) — due_at задачи
  summary: string;
  description?: string;
};

// Экранирование текста (RFC 5545 §3.3.11): обратный слэш, запятая, точка с
// запятой и перевод строки. Порядок важен: слэш первым, иначе двойное экранирование.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// ISO → UTC basic format YYYYMMDDTHHMMSSZ.
function toIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString() // 2026-06-15T11:00:00.000Z
    .replace(/[-:]/g, '') // 20260615T110000.000Z
    .replace(/\.\d{3}Z$/, 'Z'); // 20260615T110000Z
}

const PRODID = '-//YurCase//Calendar//RU';

// Строка VCALENDAR. DTSTAMP — момент генерации (now).
export function buildIcs(events: IcsEvent[]): string {
  const stamp = toIcsUtc(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@yurcase`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(e.start)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
