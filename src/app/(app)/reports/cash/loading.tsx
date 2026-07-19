import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет кассы (каркас 2026-07-13): ряд управления → hero «Общий баланс»
// (rounded-3xl) → карточки счетов с акцент-полосой → таб-чипы счетов →
// таблица разворота по дням.
export default function CashReportLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>

      {/* Hero «Общий баланс» */}
      <Skeleton className="h-36 w-full rounded-3xl sm:h-40" />

      {/* Счета */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-card border border-border bg-surface shadow-sm"
            >
              <Skeleton className="h-1 w-full rounded-none" />
              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-5 w-20 rounded-chip" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Таб-чипы счетов */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-chip" />
        ))}
      </div>

      {/* Разворот по дням */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
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
    </main>
  );
}
