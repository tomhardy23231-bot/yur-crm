import { describe, it, expect } from 'vitest';
import {
  aggregateByDay,
  buildAccountSaldo,
  balanceAsOf,
  monthTotals,
  buildTotalRows,
  entriesFromOpening,
  round2,
  type CashRawEntry,
} from '@/lib/cash/saldo';

// Контрольный пример — образец клиента «Оборотно-сальдова відомість ОЛІМП»
// (docs/samples/oborotka-olimp-sample.xls). Три счёта: Карта (opening 500),
// Рахунок (opening 139031.19), Готівка (opening 500). Даты — Excel-serial 46143/46146/
// 46147/46148 → 2026-05-01/04/05/06. Числа взяты построчно из листов счетов и листа
// Total. DoD Этапа 7: расчёт сальдо сходится с этим примером.

const D1 = '2026-05-01';
const D4 = '2026-05-04';
const D5 = '2026-05-05';
const D6 = '2026-05-06';

function inEntry(date: string, amount: number): CashRawEntry {
  return { entry_date: date, direction: 'in', amount };
}
function outEntry(date: string, amount: number): CashRawEntry {
  return { entry_date: date, direction: 'out', amount };
}

// Рахунок — построчные операции из листа «Рахунок» (несколько строк в день,
// чтобы проверить и агрегацию по дню, и накопительный перенос).
const RAHUNOK_OPENING = 139031.19;
const rahunokEntries: CashRawEntry[] = [
  // 2026-05-01 — надходження 28916.80, видатки 98985.45
  inEntry(D1, 10000), // Татаринцев
  inEntry(D1, 12500), // Рибачук
  inEntry(D1, 5000), // Молозовенко
  inEntry(D1, 1416.8), // Відсотки на залишок
  outEntry(D1, 10000), // оренда
  outEntry(D1, 8339.24), // військовий збір
  outEntry(D1, 41696.21), // єдиний податок
  outEntry(D1, 38950), // реклама
  // 2026-05-04 — лише видатки 9277.45
  outEntry(D4, 316.72),
  outEntry(D4, 6758.71),
  outEntry(D4, 1908.02),
  outEntry(D4, 294),
  // 2026-05-05 — надходження 40000, видатки 76418.99
  inEntry(D5, 40000), // Константинов
  outEntry(D5, 8285.1),
  outEntry(D5, 12578),
  outEntry(D5, 11898.9),
  outEntry(D5, 2535),
  outEntry(D5, 354),
  outEntry(D5, 9200),
  outEntry(D5, 1567.99),
  outEntry(D5, 30000),
  // 2026-05-06 — надходження 10000
  inEntry(D6, 10000), // Дубарец
];

// Карта и Готівка — по одному дню (opening 500, in 3000, out 2000 → 1500).
const KARTA_OPENING = 500;
const GOTIVKA_OPENING = 500;
const oneDayEntries: CashRawEntry[] = [inEntry(D1, 3000), outEntry(D1, 2000)];

describe('round2', () => {
  it('гасит дрейф double до копеек', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(23266.100000000006)).toBe(23266.1);
  });
});

describe('aggregateByDay', () => {
  it('сводит несколько строк дня в приход/расход и сортирует по дате', () => {
    const days = aggregateByDay(rahunokEntries);
    expect(days.map((d) => d.date)).toEqual([D1, D4, D5, D6]);
    expect(days[0]).toEqual({ date: D1, inflow: 28916.8, outflow: 98985.45 });
    expect(days[1]).toEqual({ date: D4, inflow: 0, outflow: 9277.45 });
    expect(days[2]).toEqual({ date: D5, inflow: 40000, outflow: 76418.99 });
    expect(days[3]).toEqual({ date: D6, inflow: 10000, outflow: 0 });
  });
});

describe('rollForwardDays — накопительный разворот (Рахунок ОЛІМП)', () => {
  const { rows } = buildAccountSaldo(RAHUNOK_OPENING, rahunokEntries);

  it('остаток на конец каждого дня сходится с образцом', () => {
    expect(rows.map((r) => r.closing)).toEqual([68962.54, 59685.09, 23266.1, 33266.1]);
  });

  it('остаток на начало дня = остаток на конец предыдущего (перенос)', () => {
    expect(rows[0]!.opening).toBe(139031.19);
    expect(rows[1]!.opening).toBe(68962.54);
    expect(rows[2]!.opening).toBe(59685.09);
    expect(rows[3]!.opening).toBe(23266.1);
  });

  it('каждая строка: closing = opening + inflow − outflow', () => {
    for (const r of rows) {
      expect(round2(r.opening + r.inflow - r.outflow)).toBe(r.closing);
    }
  });
});

describe('Карта и Готівка ОЛІМП', () => {
  it('opening 500 + 3000 − 2000 → 1500', () => {
    const karta = buildAccountSaldo(KARTA_OPENING, oneDayEntries);
    expect(karta.rows).toEqual([
      { date: D1, opening: 500, inflow: 3000, outflow: 2000, closing: 1500 },
    ]);
    expect(karta.closingBalance).toBe(1500);
  });
});

describe('balanceAsOf — остаток на конец даты (перенос)', () => {
  it('Рахунок: переносит остаток на дни без операций', () => {
    // 2026-05-02/03 операций нет → остаток держится на уровне 2026-05-01 (68962.54).
    expect(balanceAsOf(RAHUNOK_OPENING, rahunokEntries, '2026-05-02')).toBe(68962.54);
    expect(balanceAsOf(RAHUNOK_OPENING, rahunokEntries, '2026-05-03')).toBe(68962.54);
    expect(balanceAsOf(RAHUNOK_OPENING, rahunokEntries, D5)).toBe(23266.1);
  });
});

describe('buildTotalRows — лист Total ОЛІМП (остаток на конец дня по счетам + Всього)', () => {
  const accounts = [
    { id: 'karta', openingBalance: KARTA_OPENING, entries: oneDayEntries },
    { id: 'rahunok', openingBalance: RAHUNOK_OPENING, entries: rahunokEntries },
    { id: 'gotivka', openingBalance: GOTIVKA_OPENING, entries: oneDayEntries },
  ];
  const total = buildTotalRows(accounts);

  it('даты Total = объединение дней с операциями любого счёта', () => {
    expect(total.map((r) => r.date)).toEqual([D1, D4, D5, D6]);
  });

  it('«Всього» на каждый день сходится с листом Total образца', () => {
    // 46143→71962.54, 46146→62685.09, 46147→26266.10, 46148→36266.10.
    expect(total.map((r) => r.total)).toEqual([71962.54, 62685.09, 26266.1, 36266.1]);
  });

  it('остаток каждого счёта на конец дня (с переносом) верен', () => {
    const d1 = total[0]!;
    expect(d1.perAccount.karta).toBe(1500);
    expect(d1.perAccount.rahunok).toBe(68962.54);
    expect(d1.perAccount.gotivka).toBe(1500);
    // Карта/Готівка после 2026-05-01 операций не имеют — держат 1500.
    expect(total[3]!.perAccount.karta).toBe(1500);
    expect(total[3]!.perAccount.rahunok).toBe(33266.1);
  });
});

describe('monthTotals и фильтр по месяцу', () => {
  it('Σприход/Σрасход/чистое за месяц по Рахунку', () => {
    const { rows } = buildAccountSaldo(RAHUNOK_OPENING, rahunokEntries, {
      monthStart: '2026-05-01',
      monthEnd: '2026-05-31',
    });
    const t = monthTotals(rows);
    expect(t.inflow).toBe(78916.8); // 28916.8 + 40000 + 10000
    expect(t.outflow).toBe(184681.89); // 98985.45 + 9277.45 + 76418.99
    expect(t.net).toBe(-105765.09);
  });

  it('фильтр по месяцу не теряет перенос остатка в первую строку', () => {
    // Операции только в мае; июнь пуст, но остаток на начало = майский closing.
    const june = buildAccountSaldo(RAHUNOK_OPENING, rahunokEntries, {
      monthStart: '2026-06-01',
      monthEnd: '2026-06-30',
    });
    expect(june.rows).toEqual([]); // строк нет, но …
    expect(june.closingBalance).toBe(33266.1); // … накопленный остаток верен
  });
});

describe('entriesFromOpening — операции до opening_date не влияют на баланс', () => {
  it('отбрасывает операции раньше даты начального остатка', () => {
    const es: CashRawEntry[] = [
      inEntry('2026-04-30', 100), // до opening_date — должна выпасть
      inEntry('2026-05-01', 50), // ровно в дату начала — входит
      inEntry('2026-05-02', 70),
    ];
    const kept = entriesFromOpening(es, '2026-05-01');
    expect(kept.map((e) => e.entry_date)).toEqual(['2026-05-01', '2026-05-02']);
    // Баланс по отфильтрованным = 120 (без учёта 100 до даты начального остатка).
    expect(buildAccountSaldo(0, kept).closingBalance).toBe(120);
  });

  it('пустой результат, если все операции раньше opening_date', () => {
    const es: CashRawEntry[] = [inEntry('2026-04-01', 10), outEntry('2026-04-15', 5)];
    expect(entriesFromOpening(es, '2026-05-01')).toEqual([]);
  });
});
