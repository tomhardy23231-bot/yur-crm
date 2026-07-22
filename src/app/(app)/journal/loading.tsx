import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет журнала: шапка + ряд фильтров + карточки дней со строками
// «тинт-иконка + текст + время» (зеркалит page.tsx).
export default function JournalLoading() {
  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-6 w-36" />
        </div>
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-40 rounded-control" />
        <Skeleton className="h-8 w-36 rounded-control" />
        <Skeleton className="h-8 w-32 rounded-control" />
        <Skeleton className="h-8 w-32 rounded-control" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, groupIdx) => (
          <Card key={groupIdx}>
            <div className="flex items-center justify-between border-b border-border bg-surface-sunken/40 px-4 py-2.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            {Array.from({ length: groupIdx === 0 ? 5 : 3 }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="flex items-start gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
              >
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
                  <Skeleton className="h-3.5 w-64 max-w-full" />
                  <Skeleton className="h-5 w-32 rounded-md" />
                </div>
                <Skeleton className="h-3.5 w-10 shrink-0" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </main>
  );
}
