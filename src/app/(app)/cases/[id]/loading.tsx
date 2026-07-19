import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Скелет карточки дела (редизайн v5, 2026-07): action-bar → шапка (бейджи,
// заголовок, инфо-плитки, полоса оплаты) → таб-бар пилюль → вкладка «Обзор»
// (широкая левая колонка + sticky-сайдбар деталей).
export default function CaseCardLoading() {
  return (
    <main
      className="flex flex-col gap-3 px-3 py-1.5 sm:px-4"
      aria-busy="true"
    >
      {/* Action-bar */}
      <div className="-mx-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border bg-surface/85 px-3 py-1.5 sm:-mx-4">
        <Skeleton className="h-7 w-24 rounded-md" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>

      {/* Шапка дела */}
      <Card className="overflow-visible">
        <div className="flex flex-col gap-2 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-6 w-32 rounded-chip" />
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-chip" />
              </div>
              <Skeleton className="h-7 w-80 max-w-full" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-2.5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-3.5 w-28 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border bg-primary-softer/40 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-48 max-w-[60%]" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </Card>

      {/* Таб-бар */}
      <div className="inline-flex max-w-full gap-1 self-start overflow-hidden rounded-full border border-border bg-surface p-1 shadow-sm">
        {['w-24', 'w-20', 'w-24', 'w-16', 'w-28', 'w-20'].map((w, i) => (
          <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
        ))}
      </div>

      {/* Вкладка «Обзор»: левая колонка + сайдбар */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="px-5 py-4">
            <Skeleton className="mb-3 h-4 w-32" />
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="h-[18px] w-[18px] rounded-md" />
                  <Skeleton className="h-3.5 w-[70%]" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-[85%]" />
              <Skeleton className="h-3.5 w-[60%]" />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Skeleton className="h-4 w-4 rounded-md" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="border-b border-border px-5 pb-2 pt-3">
              <Skeleton className="h-16 w-full rounded-control" />
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3.5 w-[80%]" />
                </div>
              </div>
            ))}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-5">
            <Skeleton className="mb-3.5 h-3.5 w-28" />
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, s) => (
                <div key={s} className="flex flex-col gap-2.5">
                  <Skeleton className="h-3 w-24" />
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={i % 2 === 0 ? 'h-3 w-20' : 'h-3 w-28'}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <Skeleton className="mb-3 h-3.5 w-32" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 border-b border-border py-2 last:border-0"
              >
                <Skeleton className="h-6 w-6 rounded-md" />
                <div className="flex flex-1 flex-col gap-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
            ))}
            <div className="mt-2.5 flex items-center justify-between border-t-2 border-border pt-2.5">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}
