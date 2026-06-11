import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет отчёта «Финансы и ЗП» (v3 Сессия 6): шапка + карточка ставок +
// классическая таблица сотрудников (отчёт остался на <Table>, не на карточках).
export default function PayrollReportLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      {/* Ставки по категориям */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-44 rounded-md" />
          ))}
        </div>
      </div>

      {/* Таблица сотрудников */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="h-10 px-4 text-left">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={6} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
