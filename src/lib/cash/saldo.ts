// Юр CRM — v2 Этап 7: расчёт сальдо кассы (чистые функции, без сервера → юнит-тест).
//
// Модель (образец ОЛІМП, docs/samples/oborotka-olimp-sample.xls): по каждому счёту —
// разворот по дням. Остаток на начало дня = остаток на конец предыдущего (накопительно
// от opening_balance/opening_date). Остаток на конец = начало + Σприход − Σрасход.
// Лист Total: за каждый день — остаток на конец КАЖДОГО счёта + сумма «Всього».
//
// Источник правды расчёта — здесь (а не в SQL): сложение по дням тривиально, зато
// поддаётся точному юнит-тесту по контрольному примеру XLS.

import type { CashDirection, CashEntryWithCase } from '@/lib/types/db';

// Округление до копеек — гасит дрейф double (Σ 0.1 даёт ...0000006).
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Сырьё одной операции для агрегации (нужны лишь дата/направление/сумма).
export type CashRawEntry = Pick<CashEntryWithCase, 'entry_date' | 'direction' | 'amount'>;

// Операции раньше даты начального остатка счёта в баланс НЕ входят (их влияние уже
// «зашито» в opening_balance / в перенос cash_balances_before). Возвращает только
// операции с entry_date >= openingDate; остальные показываются в журнале с пометкой,
// но на сальдо не влияют (см. app/(app)/reports/cash/page). Generic — работает и над
// CashEntryWithCase, и над CashRawEntry.
export function entriesFromOpening<T extends { entry_date: string }>(
  entries: ReadonlyArray<T>,
  openingDate: string,
): T[] {
  return entries.filter((e) => e.entry_date >= openingDate);
}

// Свёртка по дню: суммы прихода и расхода за дату.
export type CashDayInput = {
  date: string; // YYYY-MM-DD
  inflow: number;
  outflow: number;
};

// Строка разворота по дню (как в образце): остаток на начало → обороты → остаток на конец.
export type CashDayRow = {
  date: string;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
};

// Агрегируем операции по дню и сортируем по дате (ISO-строки сравнимы лексикографически).
export function aggregateByDay(entries: ReadonlyArray<CashRawEntry>): CashDayInput[] {
  const byDay = new Map<string, { inflow: number; outflow: number }>();
  for (const e of entries) {
    const cur = byDay.get(e.entry_date) ?? { inflow: 0, outflow: 0 };
    if (e.direction === 'in') cur.inflow += e.amount;
    else cur.outflow += e.amount;
    byDay.set(e.entry_date, cur);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, v]) => ({ date, inflow: round2(v.inflow), outflow: round2(v.outflow) }));
}

// Накопительный разворот: остаток на начало дня = бегущий остаток (на конец прошлого
// дня), на конец = начало + приход − расход. Дни должны идти по возрастанию даты.
// Возвращает по строке на каждый день С ОПЕРАЦИЯМИ (дни без операций просто переносят
// остаток — отдельной строки для них в отчёте нет, как и в образце нет лишних строк
// в Total для безоперационных дней… см. примечание в тесте).
export function rollForwardDays(
  openingBalance: number,
  days: ReadonlyArray<CashDayInput>,
): CashDayRow[] {
  let running = round2(openingBalance);
  const rows: CashDayRow[] = [];
  for (const d of days) {
    const opening = running;
    const inflow = round2(d.inflow);
    const outflow = round2(d.outflow);
    const closing = round2(opening + inflow - outflow);
    rows.push({ date: d.date, opening, inflow, outflow, closing });
    running = closing;
  }
  return rows;
}

// Полный разворот одного счёта от его начального остатка по всем операциям.
// Если заданы границы месяца [monthStart, monthEnd] (включительно) — возвращаем
// строки только этого месяца, но остаток на начало первой показанной строки уже
// учитывает перенос из предыдущих периодов (бегущий остаток).
export type CashAccountSaldo = {
  rows: CashDayRow[];
  // Остаток на конец последнего дня с операциями (или начальный, если операций нет).
  closingBalance: number;
};

export function buildAccountSaldo(
  openingBalance: number,
  entries: ReadonlyArray<CashRawEntry>,
  range?: { monthStart: string; monthEnd: string },
): CashAccountSaldo {
  const days = aggregateByDay(entries);
  const all = rollForwardDays(openingBalance, days);
  const closingBalance = all.length ? all[all.length - 1]!.closing : round2(openingBalance);
  const rows = range
    ? all.filter((r) => r.date >= range.monthStart && r.date <= range.monthEnd)
    : all;
  return { rows, closingBalance };
}

// Остаток счёта на конец указанной даты (включительно): начальный + Σ(приход−расход)
// по операциям с entry_date <= date. Нужен для листа Total (остаток каждого счёта на
// конец дня) и для переноса между месяцами.
export function balanceAsOf(
  openingBalance: number,
  entries: ReadonlyArray<CashRawEntry>,
  date: string,
): number {
  let bal = round2(openingBalance);
  for (const e of entries) {
    if (e.entry_date <= date) bal += e.direction === 'in' ? e.amount : -e.amount;
  }
  return round2(bal);
}

// Итоги месяца по счёту: Σприход, Σрасход, чистое изменение (приход−расход).
export type CashMonthTotals = { inflow: number; outflow: number; net: number };

export function monthTotals(rows: ReadonlyArray<CashDayRow>): CashMonthTotals {
  let inflow = 0;
  let outflow = 0;
  for (const r of rows) {
    inflow += r.inflow;
    outflow += r.outflow;
  }
  inflow = round2(inflow);
  outflow = round2(outflow);
  return { inflow, outflow, net: round2(inflow - outflow) };
}

// Строка листа Total: дата + остаток на конец дня по каждому счёту + «Всього».
export type CashTotalRow = {
  date: string;
  perAccount: Record<string, number>; // accountId → остаток на конец дня
  total: number;
};

// Свод по всем счетам: на каждую дату с операциями (по любому счёту) — остаток на конец
// дня каждого счёта (с переносом) и их сумма. accounts: id → {openingBalance, entries}.
export function buildTotalRows(
  accounts: ReadonlyArray<{ id: string; openingBalance: number; entries: ReadonlyArray<CashRawEntry> }>,
  range?: { monthStart: string; monthEnd: string },
): CashTotalRow[] {
  const dateSet = new Set<string>();
  for (const a of accounts) {
    for (const e of a.entries) {
      if (!range || (e.entry_date >= range.monthStart && e.entry_date <= range.monthEnd)) {
        dateSet.add(e.entry_date);
      }
    }
  }
  const dates = [...dateSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return dates.map((date) => {
    const perAccount: Record<string, number> = {};
    let total = 0;
    for (const a of accounts) {
      const bal = balanceAsOf(a.openingBalance, a.entries, date);
      perAccount[a.id] = bal;
      total += bal;
    }
    return { date, perAccount, total: round2(total) };
  });
}

// Направления — мелкий хелпер для UI (минус красным, плюс — приход).
export function isInflow(direction: CashDirection): boolean {
  return direction === 'in';
}
