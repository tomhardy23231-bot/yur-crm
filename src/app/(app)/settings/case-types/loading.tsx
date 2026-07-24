import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет «Типы дел»: back-link → карточка создания → список типов.
export default function SettingsCaseTypesLoading() {
  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4" aria-busy="true">
      <Skeleton className="h-4 w-32" />

      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-3.5 w-80 max-w-full" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-control" />
            </div>
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-20 rounded-chip" />
            </div>
            <Skeleton className="h-8 w-20 rounded-control" />
          </div>
        ))}
      </Card>
    </main>
  );
}
