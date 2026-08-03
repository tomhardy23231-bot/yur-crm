import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет кассы (каркас «Бухгалтерия», 2026-08-03): строка периода → полоса
// итогов → рейка разделов слева + таблица разворота справа. Повторяет реальную
// раскладку, чтобы контент не «прыгал» после загрузки.
export default function CashReportLoading() {
  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4" aria-busy="true">
      {/* Подпись периода + селектор */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-10 w-56 rounded-xl" />
      </div>

      {/* Полоса итогов: четыре показателя в строку */}
      <div className="flex flex-wrap overflow-hidden rounded-card border border-border bg-surface shadow-sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[148px] flex-1 border-r border-border px-4 py-2.5 last:border-r-0"
          >
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Рейка разделов */}
        <div className="md:w-[218px] md:shrink-0">
          <Skeleton className="h-11 w-full rounded-card md:hidden" />
          <div className="hidden flex-col gap-1 rounded-card border border-border bg-surface p-2 shadow-sm md:flex">
            {[3, 4, 4].map((count, g) => (
              <div key={g} className="flex flex-col gap-1">
                <Skeleton className="mx-2.5 mb-0.5 mt-2 h-2 w-20" />
                {Array.from({ length: count }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full rounded-[9px]" />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Действия раздела */}
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Skeleton className="h-8 w-32 rounded-chip" />
            <Skeleton className="h-8 w-32 rounded-chip" />
          </div>

          {/* Разворот по дням */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-border">
                <tr>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <th key={i} className="h-10 px-4 text-left">
                      <Skeleton className="h-3 w-16" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={5} />
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-6 border-t border-border bg-surface-sunken/50 px-4 py-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </div>

          {/* Мобайл: стопка день-карточек */}
          <ul className="flex flex-col gap-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
              >
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-28" />
              </li>
            ))}
          </ul>

          {/* Журнал операций */}
          <div className="hidden rounded-card border border-border bg-surface shadow-sm md:block">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-8 rounded-chip" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-24 rounded-chip" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
