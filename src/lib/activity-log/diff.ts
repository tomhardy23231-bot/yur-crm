// Считает «полезный» diff двух объектов по белому списку полей.
// Используется для action'ов вида *_updated: логируем только то, что реально
// изменилось, и пропускаем no-op apdate'ы (не плодим мусор в журнале).
//
// Семантика «изменилось»:
//   - примитивы и null — строгое неравенство;
//   - массивы — сравниваются как «то же содержимое в том же порядке»
//     (нам важно для tags[] и billing_types[], которые редактируются через форму).
//   - объекты — Phase 1 не сравниваются (полей таких в логируемых сущностях нет).

export type DiffEntry = { from: unknown; to: unknown };

export type DiffResult = Record<string, DiffEntry>;

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b);
  return a === b;
}

export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: ReadonlyArray<keyof T & string>,
): DiffResult | null {
  const out: DiffResult = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = before[f];
    const b = after[f] as unknown;
    if (!isEqual(a, b)) {
      out[f] = { from: a ?? null, to: b ?? null };
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}
