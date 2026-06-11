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

// Skeleton listing-экрана. v3 Сессия 6: списки переехали на «карточки-строки»
// (CardListShell в card-table.tsx) — скелет повторяет тот же макет: подписи
// колонок без фона + отдельные rounded-карточки с gap-2 на фоне страницы.
export function ListingSkeleton({
  filterCount = 3,
  columns,
  rows = 8,
}: {
  filterCount?: number;
  columns: number;
  rows?: number;
}) {
  const grid = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        {Array.from({ length: filterCount }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
        <Skeleton className="h-9 w-36 ml-auto" />
      </div>

      <div className="flex flex-col gap-2">
        {/* Подписи колонок (как шапка CardListShell — вне карточек). */}
        <div
          style={grid}
          className="hidden items-center gap-3 px-4 pb-0.5 md:grid"
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16 max-w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={grid}
            className="grid min-h-[64px] items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
          >
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={j} className="h-3.5 w-[80%]" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
