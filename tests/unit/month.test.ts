import { describe, it, expect } from 'vitest';
import {
  normalizeMonth,
  nextMonth,
  prevMonth,
  monthParam,
  monthLabel,
  monthNamesFrom,
  MONTH_NAMES_RU,
} from '@/lib/payroll/month';

// Чистые строковые операции над 'YYYY-MM-01'. Покрываем границы года
// (декабрь → январь) и невалидный ввод (должен упасть в текущий месяц).

describe('normalizeMonth', () => {
  it('приводит YYYY-MM к YYYY-MM-01', () => {
    expect(normalizeMonth('2026-06')).toBe('2026-06-01');
  });

  it('оставляет YYYY-MM-01 как есть', () => {
    expect(normalizeMonth('2026-06-01')).toBe('2026-06-01');
  });

  it('игнорирует день в YYYY-MM-DD, фиксирует на 01', () => {
    expect(normalizeMonth('2026-06-15')).toBe('2026-06-01');
  });

  it('невалидный месяц (00, 13) → текущий месяц (YYYY-MM-01)', () => {
    expect(normalizeMonth('2026-13')).toMatch(/^\d{4}-\d{2}-01$/);
    expect(normalizeMonth('2026-00')).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('пустой/мусорный ввод → текущий месяц', () => {
    expect(normalizeMonth('')).toMatch(/^\d{4}-\d{2}-01$/);
    expect(normalizeMonth(null)).toMatch(/^\d{4}-\d{2}-01$/);
    expect(normalizeMonth(undefined)).toMatch(/^\d{4}-\d{2}-01$/);
    expect(normalizeMonth('foo')).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('nextMonth', () => {
  it('обычный месяц +1', () => {
    expect(nextMonth('2026-06-01')).toBe('2026-07-01');
  });

  it('декабрь → январь следующего года', () => {
    expect(nextMonth('2026-12-01')).toBe('2027-01-01');
  });

  it('паддинг одиночной цифры месяца', () => {
    expect(nextMonth('2026-08-01')).toBe('2026-09-01');
  });
});

describe('prevMonth', () => {
  it('обычный месяц −1', () => {
    expect(prevMonth('2026-06-01')).toBe('2026-05-01');
  });

  it('январь → декабрь предыдущего года', () => {
    expect(prevMonth('2026-01-01')).toBe('2025-12-01');
  });
});

describe('monthParam', () => {
  it('обрезает до YYYY-MM для URL', () => {
    expect(monthParam('2026-06-01')).toBe('2026-06');
  });
});

describe('monthLabel', () => {
  it('русская подпись по умолчанию', () => {
    expect(monthLabel('2026-06-01')).toBe('Июнь 2026');
    expect(monthLabel('2026-01-01')).toBe('Январь 2026');
    expect(monthLabel('2026-12-01')).toBe('Декабрь 2026');
  });

  it('использует переданные локализованные названия', () => {
    const uk = [...MONTH_NAMES_RU];
    uk[5] = 'Червень';
    expect(monthLabel('2026-06-01', uk)).toBe('Червень 2026');
  });
});

describe('monthNamesFrom', () => {
  it('собирает массив из словаря в правильном порядке (0 = январь)', () => {
    const dict = {
      monthNames: {
        january: 'Січень',
        february: 'Лютий',
        march: 'Березень',
        april: 'Квітень',
        may: 'Травень',
        june: 'Червень',
        july: 'Липень',
        august: 'Серпень',
        september: 'Вересень',
        october: 'Жовтень',
        november: 'Листопад',
        december: 'Грудень',
      },
    };
    const names = monthNamesFrom(dict);
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('Січень');
    expect(names[11]).toBe('Грудень');
    // Связка с monthLabel.
    expect(monthLabel('2026-06-01', names)).toBe('Червень 2026');
  });
});
