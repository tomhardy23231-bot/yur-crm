// ============================================================================
// Реестр колонок десктоп-списка дел (/cases): единый источник для сетки
// (grid-template-columns), настройки видимости («Колонки») и минимальной
// ширины таблицы. Первая колонка (номер/клиент) и последняя (действия) —
// не отключаемые, поэтому в реестр не входят.
// Видимость хранится per-device в localStorage (без БД) — см.
// components/cases/cases-view-settings.tsx.
// ============================================================================

export const CASES_TOGGLEABLE_COLUMNS = [
  { id: 'stage', width: 'minmax(150px,1fr)', min: 150 },
  { id: 'category', width: '132px', min: 132 },
  { id: 'priority', width: '116px', min: 116 },
  { id: 'expert', width: 'minmax(160px,1fr)', min: 160 },
  { id: 'opened', width: '104px', min: 104 },
  { id: 'sum', width: '152px', min: 152 },
  { id: 'debt', width: '116px', min: 116 },
] as const;

export type CasesColumnId = (typeof CASES_TOGGLEABLE_COLUMNS)[number]['id'];

export const CASES_COLUMN_IDS = CASES_TOGGLEABLE_COLUMNS.map((c) => c.id);

// Крайние (всегда видимые) колонки: номер/название и иконки-действия.
export const CASES_FIRST_COL = 'minmax(210px,1.6fr)';
export const CASES_FIRST_COL_MIN = 210;
export const CASES_LAST_COL = '156px';
export const CASES_LAST_COL_MIN = 156;

// Запас к сумме min-ширин колонок (паддинги карточки + гэпы сетки) — подобран
// так, чтобы полный набор колонок давал прежние 1376px.
export const CASES_MIN_WIDTH_SLACK = 80;

export function isCasesColumnId(value: string): value is CasesColumnId {
  return (CASES_COLUMN_IDS as readonly string[]).includes(value);
}

/** grid-template-columns для набора скрытых колонок. */
export function casesGridTemplate(hidden: ReadonlySet<string>): string {
  const middle = CASES_TOGGLEABLE_COLUMNS.filter((c) => !hidden.has(c.id));
  return [CASES_FIRST_COL, ...middle.map((c) => c.width), CASES_LAST_COL].join(' ');
}

/** Минимальная ширина сетки (px) для набора скрытых колонок. */
export function casesGridMinWidth(hidden: ReadonlySet<string>): number {
  const middle = CASES_TOGGLEABLE_COLUMNS.filter((c) => !hidden.has(c.id));
  return (
    CASES_FIRST_COL_MIN +
    middle.reduce((sum, c) => sum + c.min, 0) +
    CASES_LAST_COL_MIN +
    CASES_MIN_WIDTH_SLACK
  );
}

/** Дефолтный шаблон (все колонки видимы) — фолбэк var(--cases-cols, …). */
export const CASES_DEFAULT_TEMPLATE = casesGridTemplate(new Set());
export const CASES_DEFAULT_MIN_WIDTH = casesGridMinWidth(new Set());
