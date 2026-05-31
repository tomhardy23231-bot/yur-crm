import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function TasksLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28 ml-auto" />
      </div>

      {Array.from({ length: 3 }).map((_, groupIdx) => (
        <section key={groupIdx} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Card className="divide-y divide-border p-0">
            {Array.from({ length: 3 }).map((_, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-3.5 flex-1 max-w-md" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </main>
  );
}
