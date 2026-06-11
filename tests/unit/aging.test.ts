import { describe, it, expect } from 'vitest';
import {
  computeAging,
  debtAgeDays,
  type AgingInputRow,
} from '@/lib/dashboard/aging';

// v3 Сессия 9: разрез дебиторки по давности. Возраст — от последней оплаты (или
// открытия) до сегодня; бакеты <30/30-60/60-90/90+.

const TODAY = '2026-06-11';

describe('debtAgeDays', () => {
  it('считает дни от last_paid_at, если он есть', () => {
    const row: AgingInputRow = {
      debt: 100,
      last_paid_at: '2026-06-01',
      opened_at: '2026-01-01',
    };
    expect(debtAgeDays(row, TODAY)).toBe(10);
  });

  it('падает на opened_at, если оплат не было', () => {
    const row: AgingInputRow = {
      debt: 100,
      last_paid_at: null,
      opened_at: '2026-05-12',
    };
    expect(debtAgeDays(row, TODAY)).toBe(30);
  });

  it('reference в будущем → 0 (без отрицательных)', () => {
    const row: AgingInputRow = {
      debt: 100,
      last_paid_at: '2026-07-01',
      opened_at: '2026-01-01',
    };
    expect(debtAgeDays(row, TODAY)).toBe(0);
  });
});

describe('computeAging', () => {
  it('пустой вход → все бакеты нулевые', () => {
    const b = computeAging([], TODAY);
    expect(b).toEqual({
      d0_30: { sum: 0, count: 0 },
      d30_60: { sum: 0, count: 0 },
      d60_90: { sum: 0, count: 0 },
      d90_plus: { sum: 0, count: 0 },
    });
  });

  it('раскидывает дела по бакетам по возрасту долга', () => {
    const rows: AgingInputRow[] = [
      { debt: 100, last_paid_at: '2026-06-01', opened_at: '2026-01-01' }, // 10 дн → 0-30
      { debt: 200, last_paid_at: '2026-05-01', opened_at: '2026-01-01' }, // 41 дн → 30-60
      { debt: 300, last_paid_at: '2026-04-01', opened_at: '2026-01-01' }, // 71 дн → 60-90
      { debt: 400, last_paid_at: null, opened_at: '2026-01-01' }, // 161 дн → 90+
    ];
    const b = computeAging(rows, TODAY);
    expect(b.d0_30).toEqual({ sum: 100, count: 1 });
    expect(b.d30_60).toEqual({ sum: 200, count: 1 });
    expect(b.d60_90).toEqual({ sum: 300, count: 1 });
    expect(b.d90_plus).toEqual({ sum: 400, count: 1 });
  });

  it('границы бакетов: ровно 30/60/90 дней попадают в верхний бакет', () => {
    const rows: AgingInputRow[] = [
      { debt: 1, last_paid_at: '2026-05-12', opened_at: '2026-01-01' }, // 30 → 30-60
      { debt: 2, last_paid_at: '2026-04-12', opened_at: '2026-01-01' }, // 60 → 60-90
      { debt: 3, last_paid_at: '2026-03-13', opened_at: '2026-01-01' }, // 90 → 90+
    ];
    const b = computeAging(rows, TODAY);
    expect(b.d0_30.count).toBe(0);
    expect(b.d30_60).toEqual({ sum: 1, count: 1 });
    expect(b.d60_90).toEqual({ sum: 2, count: 1 });
    expect(b.d90_plus).toEqual({ sum: 3, count: 1 });
  });

  it('суммирует долг нескольких дел в одном бакете', () => {
    const rows: AgingInputRow[] = [
      { debt: 100.5, last_paid_at: '2026-06-05', opened_at: '2026-01-01' },
      { debt: 200.25, last_paid_at: '2026-06-10', opened_at: '2026-01-01' },
    ];
    const b = computeAging(rows, TODAY);
    expect(b.d0_30).toEqual({ sum: 300.75, count: 2 });
  });
});
