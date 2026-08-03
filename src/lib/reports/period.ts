// Период отчёта — общий словарь для кассы и финансовых отчётов (2026-08-03).
//
// ЗАЧЕМ. До этого /reports/cash умел ровно один календарный месяц (?month=),
// а бухгалтеру нужны квартал и год. Здесь — разбор периода из URL, пресеты и
// подписи; данные за период считают SQL-функции (миграция 0017).
//
// КОНВЕНЦИИ (те же, что в lib/payroll/month):
//   • всё — чистые строковые операции над 'YYYY-MM-DD', без Date-арифметики
//     на входе/выходе, чтобы не ловить таймзонные сдвиги (Vercel работает в
//     UTC, фирма живёт в Europe/Kyiv);
//   • Date.UTC используется ТОЛЬКО как календарь (сколько дней в месяце) —
//     от него берутся числа, а не момент времени;
//   • обе границы ВКЛЮЧИТЕЛЬНЫ: [from, to], как ожидают SQL-функции.

import { kyivToday, MONTH_NAMES_RU } from '@/lib/payroll/month';

/** Пресет периода. 'custom' — произвольные даты, заданные руками. */
export type PeriodPreset = 'month' | 'quarter' | 'year' | 'custom';

export type Period = {
  /** Начало периода включительно, 'YYYY-MM-DD'. */
  from: string;
  /** Конец периода включительно, 'YYYY-MM-DD'. */
  to: string;
  /** Чем этот диапазон является — вычисляется из границ, в URL не хранится. */
  preset: PeriodPreset;
};

// Нижняя граница разумных дат. Защищает отчёты от опечаток ввода: на проде
// есть платёж с датой 0004-04-07 (промах при вводе года), и без отсечки
// помесячный отчёт «за всё время» растянулся бы на две тысячи лет.
export const MIN_DATE = '2000-01-01';
export const MAX_DATE = '2100-12-31';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Валидная ли 'YYYY-MM-DD' и попадает ли в разумные границы. */
export function isValidDate(s: string | null | undefined): s is string {
  if (!s) return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return s >= MIN_DATE && s <= MAX_DATE;
}

/** Последний день месяца, к которому относится дата. */
export function endOfMonth(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)); // 1-based
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Первый день месяца, к которому относится дата. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Следующий день — для функций с СТРОГО меньшей границей (cash_balances_before). */
export function nextDay(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/** Квартал (1–4), к которому относится дата. */
export function quarterOf(date: string): number {
  return Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
}

/** Диапазон пресета вокруг опорной даты (по умолчанию — сегодня в Киеве). */
export function presetRange(
  preset: Exclude<PeriodPreset, 'custom'>,
  anchor: string = kyivToday(),
): { from: string; to: string } {
  const year = anchor.slice(0, 4);
  if (preset === 'month') {
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
  if (preset === 'quarter') {
    const q = quarterOf(anchor);
    const firstMonth = String((q - 1) * 3 + 1).padStart(2, '0');
    const lastMonth = String(q * 3).padStart(2, '0');
    return {
      from: `${year}-${firstMonth}-01`,
      to: endOfMonth(`${year}-${lastMonth}-01`),
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Чем является диапазон: ровный месяц / квартал / год — или произвольный.
 * Пресет НЕ хранится в URL: две даты однозначно описывают период, а лишний
 * параметр рассинхронизировался бы с ними при ручной правке ссылки.
 */
export function detectPreset(from: string, to: string): PeriodPreset {
  for (const p of ['month', 'quarter', 'year'] as const) {
    const r = presetRange(p, from);
    if (r.from === from && r.to === to) return p;
  }
  return 'custom';
}

/**
 * Период из query-параметров страницы.
 *
 * Приоритет: ?from/?to → старый ?month=YYYY-MM → текущий месяц. Поддержка
 * ?month сохранена намеренно: на него ведут закладки и ссылки из отчётов по
 * зарплате, которые остались помесячными.
 */
export function resolvePeriod(params: {
  from?: string | null;
  to?: string | null;
  month?: string | null;
}): Period {
  const { from, to, month } = params;

  if (isValidDate(from) && isValidDate(to)) {
    // Перепутанные местами границы не считаем ошибкой — меняем их местами.
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { from: a, to: b, preset: detectPreset(a, b) };
  }
  // Задана одна граница — достраиваем до месяца этой даты.
  if (isValidDate(from) && !isValidDate(to)) {
    return { from, to: endOfMonth(from), preset: detectPreset(from, endOfMonth(from)) };
  }
  if (!isValidDate(from) && isValidDate(to)) {
    return { from: startOfMonth(to), to, preset: detectPreset(startOfMonth(to), to) };
  }

  const anchor = month && /^\d{4}-\d{2}/.test(month) ? `${month.slice(0, 7)}-01` : kyivToday();
  const r = presetRange('month', anchor);
  return { ...r, preset: 'month' };
}

/**
 * Сдвиг периода на шаг вперёд/назад тем же калибром: месяц→месяц,
 * квартал→квартал, год→год. Произвольный диапазон сдвигается на свою длину
 * в днях — так стрелки работают и для «последних 45 дней».
 */
export function shiftPeriod(period: Period, dir: -1 | 1): Period {
  const { from, to, preset } = period;
  if (preset === 'month' || preset === 'quarter' || preset === 'year') {
    const step = preset === 'month' ? 1 : preset === 'quarter' ? 3 : 12;
    const y = Number(from.slice(0, 4));
    const m = Number(from.slice(5, 7));
    const shifted = new Date(Date.UTC(y, m - 1 + step * dir, 1));
    const anchor = `${shifted.getUTCFullYear()}-${String(
      shifted.getUTCMonth() + 1,
    ).padStart(2, '0')}-01`;
    const r = presetRange(preset, anchor);
    return { ...r, preset };
  }
  // custom — двигаем на длину диапазона включительно.
  const days = daysBetween(from, to) + 1;
  return {
    from: addDays(from, days * dir),
    to: addDays(to, days * dir),
    preset: 'custom',
  };
}

/** Число полных дней между датами (to − from). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)) + n,
    ),
  );
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Все месяцы периода как 'YYYY-MM-01', включая пустые. SQL отдаёт только
 * месяцы с операциями — график и таблица «по месяцам» дорисовывают дыры
 * отсюда, иначе провал в феврале выглядел бы как отсутствие февраля.
 * Ограничено 120 месяцами: защита от диапазона в тысячу лет (битые даты).
 */
export function monthsInPeriod(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while ((y < endY || (y === endY && m <= endM)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** 'YYYY-MM-DD' → 'ДД.ММ.РРРР' (подпись для человека). */
export function formatDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

/**
 * Подпись периода: «Липень 2026», «II квартал 2026», «2026 рік»,
 * «01.03.2026 — 15.04.2026». `names` — локализованные названия месяцев
 * (monthNamesFrom(t.payroll)); `quarterWord`/`yearWord` — из словаря.
 */
export function periodLabel(
  period: Period,
  names: readonly string[] = MONTH_NAMES_RU,
  words: { quarter: string; year: string } = { quarter: 'квартал', year: 'год' },
): string {
  const { from, to, preset } = period;
  const y = from.slice(0, 4);
  if (preset === 'month') {
    return `${names[Number(from.slice(5, 7)) - 1]} ${y}`;
  }
  if (preset === 'quarter') {
    const roman = ['I', 'II', 'III', 'IV'][quarterOf(from) - 1];
    return `${roman} ${words.quarter} ${y}`;
  }
  if (preset === 'year') {
    return `${y} ${words.year}`;
  }
  return `${formatDate(from)} — ${formatDate(to)}`;
}

/** Параметры для ссылки/URL. Всегда обе границы — период самодостаточен. */
export function periodParams(period: Period): { from: string; to: string } {
  return { from: period.from, to: period.to };
}
