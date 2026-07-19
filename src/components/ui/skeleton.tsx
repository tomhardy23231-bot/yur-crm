import { cn } from '@/lib/utils';

// Базовый skeleton-примитив. Использует tokenized цвета DESIGN.md.
// Анимация — Tailwind animate-pulse (mid-density для prosumer SaaS).
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-surface-muted',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

// Skeleton-ряд таблицы — N ячеек одинаковой ширины (через template). Остался
// для экранов с классической <Table> (отчёты). cellHeight = TableCell (44px).
export function TableRowSkeleton({
  columns,
  className,
}: {
  columns: number;
  className?: string;
}) {
  return (
    <tr className={cn('border-b border-border last:border-0', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="h-11 px-4 align-middle">
          <Skeleton className="h-3.5 w-[80%]" />
        </td>
      ))}
    </tr>
  );
}

// Skeleton listing-экрана — зеркало макета «каркас 2026-07-13»: тулбар
// (поиск-пилюли-фильтры) + ОДНА карточка-контейнер CardListShell (rounded-card,
// шапка колонок на sunken-фоне, строки через тонкий бордер). На мобильных —
// стопка карточек-строк (как *-list-mobile).
export function ListingSkeleton({
  filterCount = 3,
  chips = 0,
  columns,
  rows = 8,
}: {
  /** Селекты-фильтры h-8 во втором ряду тулбара. */
  filterCount?: number;
  /** Пилюли-пресеты/типы перед селектами. */
  chips?: number;
  columns: number;
  rows?: number;
}) {
  const grid = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  return (
    <main className="flex flex-col gap-3 px-3 py-2 sm:px-4" aria-busy="true">
      {/* Тулбар: поиск + кнопки, ниже — пилюли и селекты */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full max-w-md rounded-control" />
          <Skeleton className="h-9 w-9 rounded-full sm:w-32" />
          <Skeleton className="ml-auto h-9 w-40 rounded-xl" />
        </div>
        {(chips > 0 || filterCount > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: chips }).map((_, i) => (
              <Skeleton key={`c${i}`} className="h-8 w-28 rounded-chip" />
            ))}
            {Array.from({ length: filterCount }).map((_, i) => (
              <Skeleton key={`f${i}`} className="h-8 w-32 rounded-control" />
            ))}
          </div>
        )}
      </div>

      {/* Десктоп: одна карточка-контейнер, шапка на sunken, строки с бордерами */}
      <div className="hidden pb-1 md:block">
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
          <div
            style={grid}
            className="grid items-center gap-3 border-b border-border bg-surface-sunken px-4 py-2.5"
          >
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16 max-w-full" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              style={grid}
              className="grid min-h-[60px] items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0"
            >
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-[85%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
              {Array.from({ length: columns - 1 }).map((_, j) => (
                <Skeleton key={j} className="h-3.5 w-[80%]" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Мобайл: стопка карточек-строк */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: Math.min(rows, 6) }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-6 w-24 rounded-chip" />
            </div>
            <Skeleton className="h-3 w-32" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3.5 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
