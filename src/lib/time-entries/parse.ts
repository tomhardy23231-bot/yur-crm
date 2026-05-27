// Парсер свободного ввода времени → целые минуты.
// Хранение в БД — int minutes (1ч 30м = 90). Дробных часов не храним,
// агрегаты не плывут от float-сложения.
//
// Принятые форматы (любой из них даёт 90):
//   "1ч 30м" / "1ч30м" / "1h 30m" / "1h30m"
//   "1:30"
//   "1.5"  / "1,5"
//   "90м"  / "90min" / "90 мин"
//
// Голое число без суффикса → ЧАСЫ (юристы пишут "0.5" имея в виду полчаса).
// Если нужно минуты — суффикс «м»/«min» обязателен. Это намеренный UX-trade-off.

const MAX_MINUTES = 24 * 60; // CHECK constraint time_entries_minutes_positive

export function parseMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(',', '.');
  if (!s) return null;

  // "1ч 30м" / "1h 30m" / "1ч30м"
  const hmMatch = s.match(
    /^(\d+(?:\.\d+)?)\s*(?:ч|h)(?:\s*(\d+)\s*(?:м|m|min|мин)?)?$/,
  );
  if (hmMatch) {
    const h = Number.parseFloat(hmMatch[1]!);
    const m = hmMatch[2] ? Number.parseInt(hmMatch[2], 10) : 0;
    if (!Number.isFinite(h) || h < 0 || m < 0) return null;
    return clamp(Math.round(h * 60 + m));
  }

  // "1:30"
  const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const h = Number.parseInt(colonMatch[1]!, 10);
    const m = Number.parseInt(colonMatch[2]!, 10);
    if (m >= 60) return null;
    return clamp(h * 60 + m);
  }

  // "90м" / "90 мин" / "90min"
  const mMatch = s.match(/^(\d+)\s*(?:м|min|мин)$/);
  if (mMatch) {
    return clamp(Number.parseInt(mMatch[1]!, 10));
  }

  // Чистое число → ЧАСЫ (с дробью).
  const numMatch = s.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const h = Number.parseFloat(numMatch[1]!);
    if (!Number.isFinite(h) || h < 0) return null;
    return clamp(Math.round(h * 60));
  }

  return null;
}

function clamp(min: number): number | null {
  if (!Number.isFinite(min) || min <= 0 || min > MAX_MINUTES) return null;
  return min;
}

// Форматтер обратно для UI.
//   90  → "1ч 30м"
//   60  → "1ч"
//   45  → "45м"
//   0   → "0м"
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min < 0) return '0м';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}
