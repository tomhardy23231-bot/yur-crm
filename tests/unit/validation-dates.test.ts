import { describe, it, expect } from 'vitest';
import {
  isValidDate,
  isWorkDate,
  isBirthDate,
  maxWorkDate,
  workDateBounds,
  birthDateBounds,
  MIN_WORK_DATE,
  MIN_BIRTH_DATE,
  WORK_DATE_FUTURE_YEARS,
} from '@/lib/validation';
import { kyivToday } from '@/lib/payroll/month';

// Разумный диапазон дат (2026-08-03). Повод: платёж уехал на 0004-04-07 —
// при вводе года набрали 0004 вместо 2026. Формат был валиден, поэтому его
// пропустили и форма, и сервер, а в отчётах он провалился на две тысячи лет
// назад. Тут проверяем, что такое больше не пройдёт.

describe('isValidDate — только формат и реальность', () => {
  it('пропускает бессмысленный год: именно эта дыра и сработала на проде', () => {
    expect(isValidDate('0004-04-07')).toBe(true);
  });

  it('отсекает несуществующие дни', () => {
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('не дата')).toBe(false);
  });
});

describe('isWorkDate — рабочие даты (деньги, дела, задачи)', () => {
  it('НЕ пропускает год с промахом в разряде', () => {
    expect(isWorkDate('0004-04-07')).toBe(false);
    expect(isWorkDate('0202-01-01')).toBe(false);
    expect(isWorkDate('9999-01-01')).toBe(false);
  });

  it('принимает обычные рабочие даты', () => {
    expect(isWorkDate('2026-04-07')).toBe(true);
    expect(isWorkDate(kyivToday())).toBe(true);
    expect(isWorkDate(MIN_WORK_DATE)).toBe(true);
  });

  it('отсекает всё раньше нижней границы', () => {
    expect(isWorkDate('1999-12-31')).toBe(false);
    expect(isWorkDate('1985-06-15')).toBe(false);
  });

  it('разрешает будущее в пределах окна — график рассрочки бывает на годы', () => {
    const today = kyivToday();
    const inTwoYears = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
    expect(isWorkDate(inTwoYears)).toBe(true);
  });

  it('отсекает слишком далёкое будущее', () => {
    const today = kyivToday();
    const tooFar = `${Number(today.slice(0, 4)) + WORK_DATE_FUTURE_YEARS + 1}${today.slice(4)}`;
    expect(isWorkDate(tooFar)).toBe(false);
  });

  it('верхняя граница ровно на +N лет включительно', () => {
    expect(isWorkDate(maxWorkDate())).toBe(true);
  });

  it('несуществующая дата не проходит и здесь', () => {
    expect(isWorkDate('2026-02-31')).toBe(false);
  });
});

describe('isBirthDate — дата рождения', () => {
  it('принимает нормальные даты рождения, в том числе давние', () => {
    expect(isBirthDate('1955-03-12')).toBe(true);
    expect(isBirthDate('2001-11-30')).toBe(true);
    expect(isBirthDate(MIN_BIRTH_DATE)).toBe(true);
  });

  it('НЕ пропускает бессмысленный год', () => {
    expect(isBirthDate('0001-01-01')).toBe(false);
    expect(isBirthDate('0004-04-07')).toBe(false);
  });

  it('не принимает будущее', () => {
    const today = kyivToday();
    const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
    expect(isBirthDate(nextYear)).toBe(false);
  });

  it('сегодня — допустимо (граничный случай)', () => {
    expect(isBirthDate(kyivToday())).toBe(true);
  });

  it('рабочая нижняя граница ей не навязана — 1970 год валиден', () => {
    // Для рабочих дат 1970-й вне диапазона, для даты рождения — норма.
    expect(isWorkDate('1970-05-05')).toBe(false);
    expect(isBirthDate('1970-05-05')).toBe(true);
  });
});

describe('границы для <input type="date">', () => {
  it('рабочие даты: min/max совпадают с логикой валидатора', () => {
    const b = workDateBounds();
    expect(b.min).toBe(MIN_WORK_DATE);
    expect(b.max).toBe(maxWorkDate());
    expect(isWorkDate(b.min)).toBe(true);
    expect(isWorkDate(b.max)).toBe(true);
  });

  it('дата рождения: с 1900 по сегодня', () => {
    const b = birthDateBounds();
    expect(b.min).toBe(MIN_BIRTH_DATE);
    expect(b.max).toBe(kyivToday());
    expect(isBirthDate(b.min)).toBe(true);
    expect(isBirthDate(b.max)).toBe(true);
  });
});
