// Утилиты помесячного режима отчёта по ЗП. Чистые строковые операции над
// 'YYYY-MM-01' — без Date-арифметики, чтобы не ловить таймзонные сдвиги.

export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

// Текущий месяц как 'YYYY-MM-01'. Вызывается на сервере (рендер по умолчанию).
export function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

// Приводит вход ('YYYY-MM' или 'YYYY-MM-01') к 'YYYY-MM-01'.
// Некорректный/пустой → текущий месяц.
export function normalizeMonth(input?: string | null): string {
  if (!input) return currentMonth();
  const m = /^(\d{4})-(\d{2})/.exec(input);
  if (!m) return currentMonth();
  const month = Number(m[2]);
  if (month < 1 || month > 12) return currentMonth();
  return `${m[1]}-${m[2]}-01`;
}

// Следующий месяц (для верхней границы диапазона дат).
export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// Предыдущий месяц.
export function prevMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

// 'YYYY-MM' для URL (?month=2026-06).
export function monthParam(month: string): string {
  return month.slice(0, 7);
}

// Человекочитаемая подпись: 'Июнь 2026'. `names` — локализованные названия
// месяцев (индекс 0 = январь); по умолчанию русские (back-compat для серверных
// отчётов, где словарь не пробрасывается).
export function monthLabel(
  month: string,
  names: readonly string[] = MONTH_NAMES_RU,
): string {
  const y = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${names[m - 1]} ${y}`;
}

// Локализованный массив названий месяцев из словаря (индекс 0 = январь).
// Для передачи в monthLabel(month, monthNamesFrom(t.payroll)).
export function monthNamesFrom(p: {
  monthNames: {
    january: string;
    february: string;
    march: string;
    april: string;
    may: string;
    june: string;
    july: string;
    august: string;
    september: string;
    october: string;
    november: string;
    december: string;
  };
}): string[] {
  const m = p.monthNames;
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
