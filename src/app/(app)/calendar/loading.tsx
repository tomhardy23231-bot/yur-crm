import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarLoading() {
  return (
    <main
      className="flex flex-col gap-6 px-8 py-10 sm:px-12"
      aria-busy="true"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Календарь
          </h1>
          <Skeleton className="h-3.5 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-9" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-7 bg-surface-muted/50 border-b border-border">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
            <div
              key={d}
              className="h-8 px-2 flex items-center text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[88px] border-r border-b border-border last:border-r-0 p-2 flex flex-col gap-2"
            >
              <Skeleton className="h-3 w-5" />
              {i % 5 === 0 && <Skeleton className="h-2 w-12" />}
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
