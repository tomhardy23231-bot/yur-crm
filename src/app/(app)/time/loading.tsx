import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function TimeLoading() {
  return (
    <main
      className="flex flex-col gap-6 px-8 py-10 sm:px-12 max-w-5xl"
      aria-busy="true"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Моё время
          </h1>
          <Skeleton className="h-3.5 w-44" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-60" />
      </div>

      <Card className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-5 flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </Card>

      {Array.from({ length: 2 }).map((_, groupIdx) => (
        <section key={groupIdx} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-44" />
          <Card className="divide-y divide-border p-0">
            {Array.from({ length: 3 }).map((_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-3.5 flex-1 max-w-md" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </main>
  );
}
