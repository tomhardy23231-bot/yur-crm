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
export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// Сегодняшняя дата 'YYYY-MM-DD' по часовому поясу фирмы (Europe/Kyiv). Реэкспорт
// единого хелпера сессии 4 (src/lib/payroll/month.ts) под привычным в формах
// именем — чтобы не плодить второй источник правды.
export const todayIso = kyivToday;
