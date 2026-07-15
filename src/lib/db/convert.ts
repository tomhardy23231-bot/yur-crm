// Конвертеры значений Prisma → форма прежних DTO (цикл v4, конверсия слоя данных).
//
// PostgREST отдавал JSON: numeric → строка/число, date → 'YYYY-MM-DD', timestamptz
// → ISO-строка. Prisma+PrismaPg отдаёт нативные типы: Decimal-объект, Date. Эти
// помощники приводят их к тем же строкам/числам, что ждут наши типы @/lib/types/db,
// чтобы call-sites и компоненты не менялись.
//
// Проверено пробой на Neon dev (с3): @db.Date приходит как Date UTC-полночи
// (2026-05-01T00:00:00.000Z) — toISOString().slice(0,10) даёт верную календарную
// дату независимо от пояса раннера (Vercel-функции — UTC). timestamptz — обычный
// инстант (мс-точность; для микросекундного optimistic locking cases берём ::text
// отдельным raw, см. lib/cases).

/** Decimal|number|string|bigint → number (numeric-колонки: суммы, %). */
export function dec(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v as never);
}

export function decOrNull(v: unknown): number | null {
  return v == null ? null : dec(v);
}

/** @db.Date (Date UTC-полночи) → 'YYYY-MM-DD'. */
export function dateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function dateOnlyOrNull(v: unknown): string | null {
  return v == null ? null : dateOnly(v);
}

/** 'YYYY-MM-DD' → Date UTC-полночи для записи в колонку @db.Date. */
export function toDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** @db.Timestamptz (Date-инстант) → ISO-строка. */
export function ts(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export function tsOrNull(v: unknown): string | null {
  return v == null ? null : ts(v);
}
