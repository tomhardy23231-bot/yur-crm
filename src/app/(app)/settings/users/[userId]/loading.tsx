import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет карточки сотрудника в настройках (2026-07-19): back-link → шапка с
// аватаром и бейджами → две колонки секций (роль/зарплата | доступ и вход) →
// широкая карточка прав с тумблерами.

function SectionCardSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Skeleton className="h-4 w-4 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col gap-4 p-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-control" />
          </div>
        ))}
        <div className="flex justify-end">
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

export default function SettingsUserCardLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-32" />

      {/* Шапка */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-chip" />
            <Skeleton className="h-6 w-24 rounded-chip" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </Card>

      {/* Две колонки секций */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SectionCardSkeleton fields={3} />
          <SectionCardSkeleton fields={2} />
        </div>
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <Skeleton className="h-4 w-4 rounded-md" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2 rounded-control border border-border p-3.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full rounded-control" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 rounded-control" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
          </div>
        </Card>
      </div>

      {/* Права: три группы строк с тумблерами */}
      <Card>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-5 p-5">
          {Array.from({ length: 3 }).map((_, g) => (
            <div key={g} className="flex flex-col">
              <Skeleton className="mb-2 h-3 w-24" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
                >
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-48 max-w-full" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
