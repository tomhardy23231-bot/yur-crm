import { Card } from '@/components/ui/card';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет отчёта «Финансы и ЗП» (каркас 2026-07-13): ряд управления
// (период + MonthPicker) → KPI-плитки → карточка ставок с треками →
// таблица сотрудников (десктоп) / карточки (мобайл).
export default function PayrollReportLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Skeleton className="h-3.5 w-48" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-40 rounded-control" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
      </div>

      {/* KPI-плитки */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-32 max-w-full" />
          </div>
        ))}
      </div>

      {/* Ставки по категориям */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Сотрудники: мобайл — карточки */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="rounded-xl border border-border bg-surface p-3.5 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex flex-col gap-1">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {/* Сотрудники: десктоп — таблица */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-sm md:block">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border">
            <tr>
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="h-10 px-4 text-left">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={6} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
