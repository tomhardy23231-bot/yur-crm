import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Скелет дашборда (редизайн 2026-07-13): hero-баннер + 4 KPI-плитки +
// двухколоночная зона (широкая слева, 340/380px справа). Generic-фолбэк
// для маршрутов без своего loading.tsx (после ревизии 2026-07-19 таких
// почти не осталось — фактически это каркас «/»).

function BlockCard({ rows = 4, bars = false }: { rows?: number; bars?: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 px-5 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-[70%]" />
                <Skeleton className="h-3 w-[45%]" />
              </div>
              <Skeleton className="h-5 w-14 rounded-chip" />
            </div>
            {bars && <Skeleton className="h-2 w-full rounded-full" />}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AppLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-4 py-4 sm:px-6"
      aria-busy="true"
    >
      {/* Hero-баннер */}
      <Skeleton className="h-44 w-full rounded-3xl sm:h-48" />

      {/* KPI-плитки */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="my-2.5 h-7 w-28" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-14 rounded-chip" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Двухколоночная зона */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <BlockCard rows={4} />
          <BlockCard rows={5} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-40" />
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-36" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-36" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="ml-auto h-3 w-8" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </Card>
          <BlockCard rows={3} />
        </div>
      </div>
    </main>
  );
}
