import type { ExpenseMethod } from '@/lib/types/db';

// Чистая логика разбора «витрат»-платежей — без server-only, чтобы её могли
// использовать и серверные модули (cleanup.ts, cleanup-actions.ts), и юнит-тесты
// (tests/unit/expense-cleanup.test.ts). Поведение перенесено 1:1 (2026-07-27).

// Слова-маркеры: как их писали на проде (укр./рус., разный регистр).
export const CLEANUP_MARKERS = ['витрат', 'расход', 'розхід', 'розход'];

// Поле целиком = трата (без «хвостов» вроде «витрати 10000»).
const EXACT = new Set([
  'витрати', 'витрата', 'витрати:', 'розхід', 'розход',
  'расход', 'расходы', 'расход:',
]);

/**
 * true — поле ЦЕЛИКОМ равно слову-маркеру («Витрати»), это точно трата.
 * false — маркер найден ВНУТРИ более длинного текста: может оказаться настоящей
 * оплатой с упоминанием расходов в комментарии (на проде найден платёж на
 * 70 000 ₴ с примечанием «безготівка · витрати 10000» — его конвертация
 * уничтожила бы реальную оплату).
 */
export function isExact(value: string | null): boolean {
  return value ? EXACT.has(value.trim().toLowerCase()) : false;
}

// Способ оплаты платежа (свободный текст) → код счёта списания расхода.
// Не угадали — 'cash': касса всё равно упадёт на дефолтный счёт, а владелец
// видит строку в отчёте и может поправить, удалив и заведя расход заново.
export function guessMethod(method: string | null, note: string | null): ExpenseMethod {
  const s = `${method ?? ''} ${note ?? ''}`.toLowerCase();
  if (s.includes('карт') || s.includes('card')) return 'card';
  if (s.includes('рахун') || s.includes('счет') || s.includes('счёт') ||
      s.includes('банк') || s.includes('bank') || s.includes('безготів')) {
    return 'bank';
  }
  return 'cash';
}
