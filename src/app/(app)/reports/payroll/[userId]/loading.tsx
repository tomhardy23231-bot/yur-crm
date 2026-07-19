import { Card } from '@/components/ui/card';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет карточки сотрудника в отчёте ЗП (2026-07-19): back-link → шапка
// (аватар + MonthPicker + кнопки) → сводка (акцент-блок + 3 ячейки) →
// таблица дел за месяц → строки премий/выплат → отпуска.
export default function PayrollEmployeeLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-28" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-44 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>

      {/* Сводка: акцент-блок + 3 ячейки */}
      <Card className="flex flex-col sm:flex-row sm:divide-x sm:divide-border">
        <div className="flex flex-col gap-2 bg-warning-bg/40 px-6 py-5 sm:w-[34%]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-40 max-w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid flex-1 grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </Card>

      {/* Дела за месяц */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
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
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Премии и выплаты — две секции карточек-строк */}
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-md" />
            <Skeleton className="h-4 w-32" />
          </div>
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
              >
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
                <Skeleton className="h-8 w-8 rounded-lg" />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Отпуска и отсутствия */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Card>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <Skeleton className="h-5 w-20 rounded-chip" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))}
        </Card>
      </section>
    </main>
  );
}
