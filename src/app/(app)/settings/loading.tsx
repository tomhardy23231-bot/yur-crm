import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет хаба настроек: плитки-ссылки разделов + карточка справки о правах.
export default function SettingsLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-sm"
          >
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-md" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Card>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0"
            >
              <Skeleton className="h-3.5 w-56 max-w-[50%]" />
              <div className="ml-auto flex items-center gap-1.5">
                <Skeleton className="h-5 w-16 rounded-chip" />
                <Skeleton className="h-5 w-20 rounded-chip" />
              </div>
            </div>
          ))}
        </Card>
        <Skeleton className="h-3 w-72 max-w-full" />
      </section>
    </main>
  );
}
