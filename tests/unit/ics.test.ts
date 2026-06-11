import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildIcs, type IcsEvent } from '@/lib/calendar/ics';

// v3 Сессия 8: ICS-фид. Проверяем формат RFC 5545: CRLF, экранирование текста,
// UTC basic format дат, UID и обязательные поля календаря/события.

afterEach(() => {
  vi.useRealTimers();
});

describe('buildIcs', () => {
  it('строит корректный VCALENDAR с CRLF и обязательными полями', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00Z'));

    const events: IcsEvent[] = [
      { uid: 'task-1', start: '2026-06-15T11:00:00Z', summary: 'Заседание' },
    ];
    const ics = buildIcs(events);

    // строки разделены CRLF
    expect(ics).toContain('\r\n');
    expect(ics).not.toMatch(/[^\r]\n/); // нет «голых» LF без CR

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//YurCase//Calendar//RU');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('END:VCALENDAR');

    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:task-1@yurcase');
    expect(ics).toContain('DTSTART:20260615T110000Z');
    expect(ics).toContain('DTSTAMP:20260615T080000Z');
    expect(ics).toContain('SUMMARY:Заседание');
    expect(ics).toContain('END:VEVENT');
  });

  it('экранирует запятую, точку с запятой, обратный слэш и перевод строки', () => {
    const events: IcsEvent[] = [
      {
        uid: 'task-2',
        start: '2026-06-15T11:00:00Z',
        summary: 'Иск: Петров, ООО; путь\\к\nделу',
      },
    ];
    const ics = buildIcs(events);
    expect(ics).toContain('SUMMARY:Иск: Петров\\, ООО\\; путь\\\\к\\nделу');
    // двоеточие НЕ экранируется
    expect(ics).toContain('Иск:');
  });

  it('добавляет DESCRIPTION только когда задано', () => {
    const withDesc = buildIcs([
      { uid: 'a', start: '2026-06-15T11:00:00Z', summary: 'S', description: 'D' },
    ]);
    expect(withDesc).toContain('DESCRIPTION:D');

    const noDesc = buildIcs([{ uid: 'b', start: '2026-06-15T11:00:00Z', summary: 'S' }]);
    expect(noDesc).not.toContain('DESCRIPTION:');
  });

  it('пустой список событий — валидный пустой календарь', () => {
    const ics = buildIcs([]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
