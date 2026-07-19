import { Card } from '@/components/ui/card';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет карточки клиента: back-link → карточка клиента (шапка с аватаром,
// мини-статы, реквизиты) → карточка «Дела клиента» с таблицей.
export default function ClientCardLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-24" />

      <Card>
        <div className="flex flex-wrap items-center gap-4 px-6 pb-4 pt-5">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-64 max-w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-chip" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border px-6 py-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-24 max-w-full" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-border p-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3.5 w-40 max-w-full" />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
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
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={6} />
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
