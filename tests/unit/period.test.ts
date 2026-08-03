import { describe, it, expect } from 'vitest';
import {
  isValidDate,
  startOfMonth,
  endOfMonth,
  nextDay,
  quarterOf,
  presetRange,
  detectPreset,
  resolvePeriod,
  shiftPeriod,
  daysBetween,
  addDays,
  monthsInPeriod,
  formatDate,
  periodLabel,
  MIN_DATE,
} from '@/lib/reports/period';

// Период отчёта — чистые строковые операции над 'YYYY-MM-DD'. Ловим границы
// месяца/квартала/года, високосный февраль и мусор в URL.

describe('isValidDate', () => {
  it('принимает корректную ISO-дату', () => {
    expect(isValidDate('2026-08-03')).toBe(true);
  });

  it('отсекает мусор и пустое', () => {
    expect(isValidDate('')).toBe(false);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
    expect(isValidDate('2026-08')).toBe(false);
    expect(isValidDate('03.08.2026')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-00-01')).toBe(false);
    expect(isValidDate('2026-08-32')).toBe(false);
  });

  it('отсекает даты вне разумных границ — на проде есть платёж 0004-04-07', () => {
    expect(isValidDate('0004-04-07')).toBe(false);
    expect(isValidDate(MIN_DATE)).toBe(true);
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('обычный месяц', () => {
    expect(startOfMonth('2026-08-17')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-17')).toBe('2026-08-31');
  });

  it('30-дневный месяц', () => {
    expect(endOfMonth('2026-04-10')).toBe('2026-04-30');
  });

  it('февраль обычного и високосного года', () => {
    expect(endOfMonth('2026-02-05')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-05')).toBe('2028-02-29');
  });
});

describe('nextDay', () => {
  it('внутри месяца', () => {
    expect(nextDay('2026-08-03')).toBe('2026-08-04');
  });

  it('через границу месяца и года', () => {
    expect(nextDay('2026-08-31')).toBe('2026-09-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  it('через 29 февраля високосного года', () => {
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2028-02-29')).toBe('2028-03-01');
  });
});

describe('quarterOf', () => {
  it('определяет квартал по месяцу', () => {
    expect(quarterOf('2026-01-15')).toBe(1);
    expect(quarterOf('2026-03-31')).toBe(1);
    expect(quarterOf('2026-04-01')).toBe(2);
    expect(quarterOf('2026-09-30')).toBe(3);
    expect(quarterOf('2026-10-01')).toBe(4);
    expect(quarterOf('2026-12-31')).toBe(4);
  });
});

describe('presetRange', () => {
  it('месяц', () => {
    expect(presetRange('month', '2026-08-17')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('кварталы', () => {
    expect(presetRange('quarter', '2026-02-10')).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
    expect(presetRange('quarter', '2026-11-05')).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
  });

  it('год', () => {
    expect(presetRange('year', '2026-06-06')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });
});

describe('detectPreset', () => {
  it('узнаёт ровный месяц, квартал, год', () => {
    expect(detectPreset('2026-08-01', '2026-08-31')).toBe('month');
    expect(detectPreset('2026-04-01', '2026-06-30')).toBe('quarter');
    expect(detectPreset('2026-01-01', '2026-12-31')).toBe('year');
  });

  it('январь-март — это квартал, а не просто месяц', () => {
    expect(detectPreset('2026-01-01', '2026-03-31')).toBe('quarter');
  });

  it('произвольный диапазон', () => {
    expect(detectPreset('2026-03-05', '2026-04-17')).toBe('custom');
    expect(detectPreset('2026-01-01', '2026-06-30')).toBe('custom'); // полугодие
  });
});

describe('resolvePeriod', () => {
  it('обе границы из URL', () => {
    expect(resolvePeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
      preset: 'month',
    });
  });

  it('переставленные местами границы меняет местами, а не падает', () => {
    const p = resolvePeriod({ from: '2026-05-31', to: '2026-05-01' });
    expect(p.from).toBe('2026-05-01');
    expect(p.to).toBe('2026-05-31');
  });

  it('одна граница достраивается до месяца', () => {
    expect(resolvePeriod({ from: '2026-03-10' }).to).toBe('2026-03-31');
    expect(resolvePeriod({ to: '2026-03-10' }).from).toBe('2026-03-01');
  });

  it('обратная совместимость со старым ?month=', () => {
    expect(resolvePeriod({ month: '2026-02' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      preset: 'month',
    });
  });

  it('мусор в from/to игнорируется — падаем на текущий месяц', () => {
    const p = resolvePeriod({ from: 'foo', to: 'bar' });
    expect(p.preset).toBe('month');
    expect(p.from).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('без параметров — текущий месяц', () => {
    const p = resolvePeriod({});
    expect(p.preset).toBe('month');
    expect(p.from).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('shiftPeriod', () => {
  it('месяц шагает месяцем, через границу года', () => {
    const dec = { from: '2026-12-01', to: '2026-12-31', preset: 'month' as const };
    expect(shiftPeriod(dec, 1)).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
      preset: 'month',
    });
    const jan = { from: '2026-01-01', to: '2026-01-31', preset: 'month' as const };
    expect(shiftPeriod(jan, -1)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
      preset: 'month',
    });
  });

  it('квартал шагает кварталом', () => {
    const q4 = { from: '2026-10-01', to: '2026-12-31', preset: 'quarter' as const };
    expect(shiftPeriod(q4, 1)).toEqual({
      from: '2027-01-01',
      to: '2027-03-31',
      preset: 'quarter',
    });
  });

  it('год шагает годом', () => {
    const y = { from: '2026-01-01', to: '2026-12-31', preset: 'year' as const };
    expect(shiftPeriod(y, -1)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
      preset: 'year',
    });
  });

  it('произвольный диапазон шагает своей длиной', () => {
    // 10 дней включительно: 01–10 → 11–20 → 21–30.
    const custom = { from: '2026-03-01', to: '2026-03-10', preset: 'custom' as const };
    expect(shiftPeriod(custom, 1)).toEqual({
      from: '2026-03-11',
      to: '2026-03-20',
      preset: 'custom',
    });
    expect(shiftPeriod(custom, -1)).toEqual({
      from: '2026-02-19',
      to: '2026-02-28',
      preset: 'custom',
    });
  });

  it('шаг туда-обратно возвращает исходный период', () => {
    const p = { from: '2026-07-01', to: '2026-07-31', preset: 'month' as const };
    expect(shiftPeriod(shiftPeriod(p, 1), -1)).toEqual(p);
  });
});

describe('daysBetween / addDays', () => {
  it('считает дни через границу месяца', () => {
    expect(daysBetween('2026-03-01', '2026-03-10')).toBe(9);
    expect(daysBetween('2026-02-25', '2026-03-02')).toBe(5);
  });

  it('addDays обратен daysBetween', () => {
    expect(addDays('2026-03-01', 9)).toBe('2026-03-10');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('monthsInPeriod', () => {
  it('перечисляет месяцы включительно', () => {
    expect(monthsInPeriod('2026-01-15', '2026-04-02')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
  });

  it('один месяц', () => {
    expect(monthsInPeriod('2026-08-01', '2026-08-31')).toEqual(['2026-08-01']);
  });

  it('через границу года', () => {
    expect(monthsInPeriod('2025-11-01', '2026-02-28')).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('год целиком — 12 месяцев', () => {
    expect(monthsInPeriod('2026-01-01', '2026-12-31')).toHaveLength(12);
  });

  it('обрезает аномальный диапазон 120 месяцами', () => {
    expect(monthsInPeriod('2000-01-01', '2099-12-31')).toHaveLength(120);
  });
});

describe('formatDate / periodLabel', () => {
  it('дата в человеческом виде', () => {
    expect(formatDate('2026-08-03')).toBe('03.08.2026');
  });

  const names = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
  ];
  const words = { quarter: 'квартал', year: 'рік' };

  it('подпись месяца', () => {
    expect(
      periodLabel({ from: '2026-07-01', to: '2026-07-31', preset: 'month' }, names, words),
    ).toBe('Липень 2026');
  });

  it('подпись квартала римской цифрой', () => {
    expect(
      periodLabel({ from: '2026-04-01', to: '2026-06-30', preset: 'quarter' }, names, words),
    ).toBe('II квартал 2026');
  });

  it('подпись года', () => {
    expect(
      periodLabel({ from: '2026-01-01', to: '2026-12-31', preset: 'year' }, names, words),
    ).toBe('2026 рік');
  });

  it('произвольный диапазон — обе даты', () => {
    expect(
      periodLabel({ from: '2026-03-01', to: '2026-04-15', preset: 'custom' }, names, words),
    ).toBe('01.03.2026 — 15.04.2026');
  });
});
