import { describe, it, expect, vi, afterEach } from 'vitest';
import { kyivToday, kyivMonth, currentMonth } from '@/lib/payroll/month';

// v3 Сессия 4: «киевская дата» не должна зависеть от TZ хоста (Vercel/Node = UTC).
// Лето в Украине — EEST (UTC+3). Проверяем границу месяца: вечер UTC 30 июня уже
// «1 июля» в Киеве, и наоборот раннее утро UTC всё ещё «вчера» по Киеву.

afterEach(() => {
  vi.useRealTimers();
});

describe('kyivMonth / currentMonth', () => {
  it('22:30 UTC 30 июня = 01:30 Киева 1 июля → июль', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(kyivMonth()).toEqual({ year: 2026, month: 7 });
    expect(currentMonth()).toBe('2026-07-01');
  });

  it('02:30 UTC 1 июля = 05:30 Киева → июль', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T02:30:00Z'));
    expect(kyivMonth()).toEqual({ year: 2026, month: 7 });
    expect(currentMonth()).toBe('2026-07-01');
  });

  it('20:00 UTC 30 июня = 23:00 Киева 30 июня → июнь', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T20:00:00Z'));
    expect(kyivMonth()).toEqual({ year: 2026, month: 6 });
    expect(currentMonth()).toBe('2026-06-01');
  });
});

describe('kyivToday', () => {
  it('возвращает киевскую дату YYYY-MM-DD (вечер UTC → следующий день)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));
    expect(kyivToday()).toBe('2026-07-01');
  });

  it('раннее утро UTC всё ещё «вчера» по Киеву только до 21:00 UTC — здесь день совпал', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T20:00:00Z'));
    expect(kyivToday()).toBe('2026-06-30');
  });
});
