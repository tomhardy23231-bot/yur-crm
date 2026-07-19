import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет «Ставки зарплаты»: back-чип → карточка с 3 боксами категорий
// (по 2 инпута) → карточка-пояснение.
export default function SettingsPayrollLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <Skeleton className="h-7 w-24 rounded-md" />

      <Card className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 2 }).map((_, j) => (
                    <div key={j} className="flex flex-col gap-1.5">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-10 w-full rounded-control" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-4">
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-3.5 w-full max-w-xl" />
          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </main>
  );
}
