// Чистая логика разреза дебиторки по давности (v3 Сессия 9). Возраст долга —
// число дней от даты последней оплаты (или открытия дела, если оплат не было) до
// сегодня (киевская дата). Бакеты <30 / 30-60 / 60-90 / 90+ дней: сумма долга и
// число дел в каждом. Даты — 'YYYY-MM-DD', парсятся в UTC-полночь (без TZ-сдвигов).

export interface AgingInputRow {
  debt: number;
  last_paid_at: string | null; // 'YYYY-MM-DD' или null (оплат не было)
  opened_at: string; // 'YYYY-MM-DD'
}

export interface AgingBucket {
  sum: number;
  count: number;
}

export interface AgingBuckets {
  d0_30: AgingBucket;
  d30_60: AgingBucket;
  d60_90: AgingBucket;
  d90_plus: AgingBucket;
}

const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number {
  // 'YYYY-MM-DD' → UTC-полночь. Невалидное → NaN.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Возраст долга в днях от reference-даты до сегодня. Отрицательный (reference в
// будущем) трактуем как 0.
export function debtAgeDays(row: AgingInputRow, todayIso: string): number {
  const ref = row.last_paid_at ?? row.opened_at;
  const refMs = toUtcMs(ref);
  const todayMs = toUtcMs(todayIso);
  if (Number.isNaN(refMs) || Number.isNaN(todayMs)) return 0;
  return Math.max(0, Math.floor((todayMs - refMs) / DAY_MS));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeAging(
  rows: AgingInputRow[],
  todayIso: string,
): AgingBuckets {
  const buckets: AgingBuckets = {
    d0_30: { sum: 0, count: 0 },
    d30_60: { sum: 0, count: 0 },
    d60_90: { sum: 0, count: 0 },
    d90_plus: { sum: 0, count: 0 },
  };

  for (const row of rows) {
    const days = debtAgeDays(row, todayIso);
    const bucket =
      days < 30
        ? buckets.d0_30
        : days < 60
          ? buckets.d30_60
          : days < 90
            ? buckets.d60_90
            : buckets.d90_plus;
    bucket.sum = round2(bucket.sum + row.debt);
    bucket.count += 1;
  }

  return buckets;
}
