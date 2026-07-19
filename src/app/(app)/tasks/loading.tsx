import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет задач (каркас 2026-07-13): тулбар (сегмент + селект + кнопки) и
// группы-карточки по дням: шапка на sunken/40 + строки «чекбокс + текст + мета».
export default function TasksLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-8 w-36 rounded-control" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }).map((_, groupIdx) => (
          <Card key={groupIdx}>
            <div className="flex items-center justify-between border-b border-border bg-surface-sunken/40 px-4 py-2.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            {Array.from({ length: 3 }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-56 max-w-full" />
                    <Skeleton className="h-4 w-16 rounded-chip" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24 rounded-lg" />
                    <Skeleton className="h-5 w-5 rounded-md" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </main>
  );
}
