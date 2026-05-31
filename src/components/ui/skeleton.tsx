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

// Skeleton-ряд таблицы — N ячеек одинаковой ширины (через template). Используется
// в loading.tsx для /cases, /clients, /tasks. cellHeight выровнен с TableCell (44px).
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

// Skeleton для табличного listing-экрана. Используется в loading.tsx —
// показывает заголовок страницы + панель фильтров + табличный каркас.
export function ListingSkeleton({
  filterCount = 3,
  columns,
  rows = 8,
}: {
  filterCount?: number;
  columns: number;
  rows?: number;
}) {
  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        {Array.from({ length: filterCount }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
        <Skeleton className="h-9 w-36 ml-auto" />
      </div>

      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="h-10 px-4 text-left">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRowSkeleton key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
