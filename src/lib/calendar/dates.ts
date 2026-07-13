import type { CalendarMessages } from '@/lib/i18n/messages/ru/calendar';

// ============================================================================
// Дата-хелперы календаря (вынесены из app/(app)/calendar/page.tsx при
// добавлении недельного вида): сетка месяца и недели считаются в локальном
// времени сервера, ключ дня — YYYY-MM-DD.
// ============================================================================

export function parseMonth(
  raw: string | undefined,
  fallback: Date,
): { year: number; monthIdx: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) {
      return { year: y, monthIdx: m - 1 };
    }
  }
  return { year: fallback.getFullYear(), monthIdx: fallback.getMonth() };
}

export function toMonthParam(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

export function startOfWeekMonday(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  // JS: вс=0, пн=1, ..., сб=6. Хотим пн как старт.
  const wd = n.getDay();
  const back = wd === 0 ? 6 : wd - 1;
  n.setDate(n.getDate() - back);
  return n;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isoDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Понедельник недели из параметра ?week=YYYY-MM-DD (любая дата нормализуется
// к своему понедельнику); мусор → неделя fallback-даты.
export function parseWeekStart(raw: string | undefined, fallback: Date): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfWeekMonday(d);
  }
  return startOfWeekMonday(fallback);
}

// Пн…Вс из словаря в порядке отображения сетки (неделя с понедельника).
export function weekdaysFrom(c: CalendarMessages): string[] {
  const w = c.weekdays;
  return [w.mon, w.tue, w.wed, w.thu, w.fri, w.sat, w.sun];
}

// Месяцы из словаря по индексу (0 = январь … 11 = декабрь).
export function monthsFrom(c: CalendarMessages): string[] {
  const m = c.months;
  return [
    m.january,
    m.february,
    m.march,
    m.april,
    m.may,
    m.june,
    m.july,
    m.august,
    m.september,
    m.october,
    m.november,
    m.december,
  ];
}
