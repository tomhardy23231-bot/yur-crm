import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет кассы (v3 Сессия 6): шапка + вкладки счетов + таблица разворота по дням.
export default function CashReportLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-60" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Вкладки счетов */}
      <div className="flex gap-1 border-b border-border pb-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>

      {/* Таблица разворота по дням */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              {Array.from({ length: 5 }).map((_, i) => (
                <th key={i} className="h-10 px-4 text-left">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={5} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
