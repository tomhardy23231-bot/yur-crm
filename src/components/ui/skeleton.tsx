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
  title,
  filterCount = 3,
  columns,
  rows = 8,
}: {
  title: string;
  filterCount?: number;
  columns: number;
  rows?: number;
}) {
  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12" aria-busy="true">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            {title}
          </h1>
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="h-9 w-36" />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        {Array.from({ length: filterCount }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
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
