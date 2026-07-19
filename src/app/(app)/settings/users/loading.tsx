import { Card } from '@/components/ui/card';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// Скелет «Сотрудники»: back-link → карточка создания → 3 мини-стата →
// таблица сотрудников (6 колонок).
export default function SettingsUsersLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-32" />

      {/* Карточка создания */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-3.5 w-72 max-w-full" />
          {Array.from({ length: 2 }).map((_, r) => (
            <div
              key={r}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1.2fr_1fr]"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 w-full rounded-control" />
                </div>
              ))}
            </div>
          ))}
          <Skeleton className="h-8 w-40 rounded-full" />
        </div>
      </Card>

      {/* Мини-статистика */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-sm"
          >
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-10" />
            </div>
          </div>
        ))}
      </div>

      {/* Таблица сотрудников */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-36" />
        </div>
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border bg-surface-sunken">
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
        <div className="flex items-center justify-between border-t border-border bg-surface-muted/50 px-4 py-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </main>
  );
}
