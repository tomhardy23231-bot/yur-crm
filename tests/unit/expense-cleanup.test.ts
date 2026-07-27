import { describe, it, expect } from 'vitest';
import { isExact, guessMethod } from '@/lib/expenses/cleanup-shared';

// Юниты разбора «витрат»-платежей (/settings/expense-cleanup).
// isExact охраняет главный прод-кейс: платёж на 70 000 ₴ с примечанием
// «безготівка · витрати 10000» — НЕ точная трата, его нельзя конвертировать
// молча (конвертация уничтожила бы реальную оплату).

describe('isExact — поле целиком равно слову-маркеру', () => {
  it('точные маркеры в любом регистре и с пробелами', () => {
    expect(isExact('витрати')).toBe(true);
    expect(isExact('Витрати')).toBe(true);
    expect(isExact('  ВИТРАТИ  ')).toBe(true);
    expect(isExact('витрата')).toBe(true);
    expect(isExact('витрати:')).toBe(true);
    expect(isExact('розхід')).toBe(true);
    expect(isExact('расход')).toBe(true);
    expect(isExact('расходы')).toBe(true);
  });

  it('маркер внутри длинного текста — НЕ точная трата (прод-кейс на 70 000 ₴)', () => {
    expect(isExact('безготівка · витрати 10000')).toBe(false);
    expect(isExact('витрати 10000')).toBe(false);
    expect(isExact('оплата та витрати')).toBe(false);
    expect(isExact('судові витрати по справі')).toBe(false);
  });

  it('пусто/null/не маркер — false', () => {
    expect(isExact(null)).toBe(false);
    expect(isExact('')).toBe(false);
    expect(isExact('оплата')).toBe(false);
    expect(isExact('безготівка')).toBe(false);
  });
});

describe('guessMethod — свободный текст → код счёта списания', () => {
  it('карта: по обоим полям, укр/eng', () => {
    expect(guessMethod('карта', null)).toBe('card');
    expect(guessMethod(null, 'оплата на карту Моно')).toBe('card');
    expect(guessMethod('card', null)).toBe('card');
  });

  it('банк: рахунок/счёт/банк/безготівка', () => {
    expect(guessMethod('безготівка', null)).toBe('bank');
    expect(guessMethod('рахунок', null)).toBe('bank');
    expect(guessMethod(null, 'на счёт фирмы')).toBe('bank');
    expect(guessMethod('bank transfer', null)).toBe('bank');
    expect(guessMethod('перевод, банк', null)).toBe('bank');
  });

  it('карта побеждает банк (проверяется первой)', () => {
    expect(guessMethod('карта банку', null)).toBe('card');
  });

  it('не угадали → cash (фолбэк на счёт по умолчанию)', () => {
    expect(guessMethod(null, null)).toBe('cash');
    expect(guessMethod('готівка', null)).toBe('cash');
    expect(guessMethod('витрати', 'витрати')).toBe('cash');
  });
});
