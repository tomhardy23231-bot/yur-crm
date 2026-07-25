import { describe, it, expect } from 'vitest';
import { initials, givenName, formatMoney, formatPercent, cn } from '@/lib/utils';

// Чистые форматтеры. Денежные/процентные форматы используют Intl с ru-RU —
// разделитель групп может быть неразрывным пробелом (U+00A0); нормализуем
// пробелы в сравнении, чтобы тест не был хрупким к коду пробела.
const norm = (s: string) => s.replace(/ /g, ' ');

// Приветствие на дашборде: ФИО в базе — «Фамилия Имя Отчество», значит имя
// это ВТОРОЕ слово (замечание владельца 2026-07-25).
describe('givenName', () => {
  it('«Тягло Аліна» → «Аліна» (не фамилия)', () => {
    expect(givenName('Тягло Аліна')).toBe('Аліна');
  });

  it('полное ФИО: «Михайлова Ольга Вікторівна» → «Ольга»', () => {
    expect(givenName('Михайлова Ольга Вікторівна')).toBe('Ольга');
  });

  it('одно слово остаётся собой', () => {
    expect(givenName('Аліна')).toBe('Аліна');
  });

  it('скобочный хвост отбрасывается: «Владелец (owner)» → «Владелец»', () => {
    expect(givenName('Владелец (owner)')).toBe('Владелец');
  });

  it('инициал вместо имени → фамилия: «Михайлова О. В.» → «Михайлова»', () => {
    expect(givenName('Михайлова О. В.')).toBe('Михайлова');
  });

  it('пустая строка не падает', () => {
    expect(givenName('')).toBe('');
    expect(givenName('   ')).toBe('');
  });
});

describe('initials', () => {
  it('отбрасывает скобочную часть: «Владелец (owner)» → «В»', () => {
    expect(initials('Владелец (owner)')).toBe('В');
  });

  it('«Юрист (продажник)» → «Ю»', () => {
    expect(initials('Юрист (продажник)')).toBe('Ю');
  });

  it('два значимых слова: «Тест Клиент №2» → «ТК»', () => {
    expect(initials('Тест Клиент №2')).toBe('ТК');
  });

  it('отбрасывает квадратные скобки', () => {
    expect(initials('Иван [admin]')).toBe('И');
  });

  it('пустая строка → «?»', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('только цифры/символы (нет значимых слов) → первый символ', () => {
    expect(initials('№2')).toBe('№');
  });

  it('латиница верхним регистром', () => {
    expect(initials('john doe')).toBe('JD');
  });
});

describe('formatMoney', () => {
  it('группирует тысячи', () => {
    expect(norm(formatMoney(10000))).toBe('10 000');
  });

  it('ноль', () => {
    expect(formatMoney(0)).toBe('0');
  });

  it('до 2 знаков дробной части', () => {
    expect(norm(formatMoney(1234.5))).toBe('1 234,5');
    expect(norm(formatMoney(1234.567))).toBe('1 234,57');
  });

  it('отрицательное (долг/возврат)', () => {
    expect(norm(formatMoney(-5000))).toContain('5 000');
  });
});

describe('formatPercent', () => {
  it('целые без дробной части', () => {
    expect(formatPercent(7)).toBe('7');
    expect(formatPercent(25)).toBe('25');
  });

  it('дробные с запятой-разделителем', () => {
    expect(formatPercent(7.5)).toBe('7,5');
  });
});

describe('cn', () => {
  it('мёржит классы и убирает конфликты Tailwind', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('отбрасывает falsy', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});
