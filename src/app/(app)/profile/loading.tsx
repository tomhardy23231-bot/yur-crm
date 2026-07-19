import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет профиля: заголовок → грид 2 колонки (профиль, язык, уведомления,
// пароль).
export default function ProfileLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* Профиль */}
        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <Card className="flex items-center gap-4 p-5">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-6 w-24 rounded-chip" />
          </Card>
        </section>

        {/* Язык */}
        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Card className="flex flex-col gap-3 p-5">
            <Skeleton className="h-3.5 w-64 max-w-full" />
            <Skeleton className="h-10 w-44 rounded-lg" />
          </Card>
        </section>

        {/* Уведомления */}
        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-36" />
          <Card className="p-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-full max-w-md" />
              <Skeleton className="h-8 w-36 rounded-full" />
            </div>
            <div className="my-4 h-px bg-border" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-full max-w-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 rounded-control" />
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>
            </div>
          </Card>
        </section>

        {/* Пароль */}
        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Card className="flex flex-col gap-4 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full rounded-control" />
              </div>
            ))}
            <Skeleton className="h-9 w-40 rounded-full" />
          </Card>
        </section>
      </div>
    </main>
  );
}
