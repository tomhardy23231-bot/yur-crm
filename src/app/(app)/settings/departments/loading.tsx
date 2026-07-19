import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет «Подразделения»: back-link → карточка создания → карточки
// подразделений со списками сотрудников.
export default function SettingsDepartmentsLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-32" />

      <Card>
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-3.5 w-72 max-w-full" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-control" />
            </div>
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, d) => (
          <Card key={d}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-20 rounded-chip" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-8 w-44 rounded-control" />
              </div>
            ))}
          </Card>
        ))}
      </section>
    </main>
  );
}
