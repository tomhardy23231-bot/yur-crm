// Единый модуль валидации/парсинга (v3 Сессия 12). Изоморфный: используется и в
// server actions, и в клиентских формах — поэтому БЕЗ 'server-only' и без node-API
// (только RegExp/Number/Date/Intl). Собирает разъехавшиеся по проекту копии
// UUID-регэкспа, парсера денежных сумм и проверки даты в одну правду.

import { kyivToday } from '@/lib/payroll/month';

// --- UUID -----------------------------------------------------------------

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Типовой guard поверх UUID_RE — для нового кода; существующие `.test()` оставлены.
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// --- Денежные суммы -------------------------------------------------------

// numeric(14,2): 12 знаков до запятой, 2 после → сумма строго меньше 1e12.
export const MAX_AMOUNT = 1_000_000_000_000;

// Сумма строго > 0. Точка/запятая, до 2 знаков. Самый строгий из прежних 4 копий
// (acts/payments/cash + клиентский parseAmountClient — все эквивалентны).
export function parseAmount(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n >= MAX_AMOUNT) return null;
  return n;
}

// Сумма >= 0 (пустая строка → 0). Для начального остатка счёта кассы.
export function parseNonNegAmount(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n >= MAX_AMOUNT) return null;
  return n;
}

// --- Даты -----------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' + реальность даты: ре-сериализация отсекает 2026-02-31 и т.п.
//
// ⚠ Формат и реальность — ещё НЕ здравый смысл: '0004-04-07' проходит эту
// проверку (так на прод и попал платёж, где вместо 2026 набрали 0004).
// Для дат, которые вводит человек, используйте isWorkDate / isBirthDate.
export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// --- Разумный диапазон дат (2026-08-03) -----------------------------------
//
// ЗАЧЕМ. Опечатка в годе (0004 вместо 2026, 2062 вместо 2026) даёт формально
// валидную дату, которая тихо ломает отчёты: платёж уезжает на две тысячи лет
// назад и выпадает из любого периода. Ловим это в трёх местах — здесь (сервер
// и клиент), атрибутами min/max в формах и CHECK-ограничением в БД (0018).
//
// Границы РАЗНЫЕ по смыслу поля: деньги и дела не бывают из 1970-х, а дата
// рождения клиента — сплошь и рядом.

/** Раньше этой даты рабочих дат в системе не бывает. */
export const MIN_WORK_DATE = '2000-01-01';

/** Насколько вперёд разрешаем: график рассрочки бывает на годы вперёд. */
export const WORK_DATE_FUTURE_YEARS = 5;

/** Верхняя граница рабочих дат — 'YYYY-MM-DD', считается от киевского сегодня. */
export function maxWorkDate(): string {
  const today = kyivToday();
  return `${Number(today.slice(0, 4)) + WORK_DATE_FUTURE_YEARS}${today.slice(4)}`;
}

/**
 * Дата платежа, расхода, дела, акта, задачи, операции кассы: реальная и в
 * разумных пределах. Именно её просят формы, где человек вводит дату руками.
 */
export function isWorkDate(s: string): boolean {
  return isValidDate(s) && s >= MIN_WORK_DATE && s <= maxWorkDate();
}

/** Раньше этой даты дат рождения не принимаем. */
export const MIN_BIRTH_DATE = '1900-01-01';

/** Дата рождения: от 1900 года и не в будущем. */
export function isBirthDate(s: string): boolean {
  return isValidDate(s) && s >= MIN_BIRTH_DATE && s <= kyivToday();
}

/**
 * Атрибуты для <input type="date"> — первый барьер, прямо в браузере: в
 * календаре недоступны годы вне диапазона, а ручной ввод подсвечивается
 * ошибкой ещё до отправки формы. Спред: <input type="date" {...workDateBounds()} />
 *
 * Это ТОЛЬКО удобство. Обойти атрибуты тривиально, поэтому те же границы
 * повторно проверяет server action (isWorkDate) и CHECK в БД (миграция 0018).
 */
export function workDateBounds(): { min: string; max: string } {
  return { min: MIN_WORK_DATE, max: maxWorkDate() };
}

/** То же для даты рождения: 1900 … сегодня. */
export function birthDateBounds(): { min: string; max: string } {
  return { min: MIN_BIRTH_DATE, max: kyivToday() };
}

// Сегодняшняя дата 'YYYY-MM-DD' по часовому поясу фирмы (Europe/Kyiv). Реэкспорт
// единого хелпера сессии 4 (src/lib/payroll/month.ts) под привычным в формах
// именем — чтобы не плодить второй источник правды.
export const todayIso = kyivToday;
