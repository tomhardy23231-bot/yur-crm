import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет обзора настроек: вводка + сводная таблица прав (разделы — в рейле).
export default function SettingsLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-80 max-w-full" />

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
