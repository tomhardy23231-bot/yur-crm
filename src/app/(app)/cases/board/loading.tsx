import { Skeleton } from '@/components/ui/skeleton';
import { CASE_STAGES } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';

// Скелет доски (каркас 2026-07-13): ряд фильтров + 5 колонок этапов —
// шапка «точка + название + счётчик», тонированная подложка rounded-card
// без бордера, карточки rounded-xl с футером. Названия этапов — настоящие.
export default async function CasesBoardLoading() {
  const { t } = await getT();
  return (
    <main
      className="flex min-h-0 flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-32 rounded-control" />
        <Skeleton className="h-8 w-36 rounded-control" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </div>

      <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2">
        {CASE_STAGES.map((stage) => (
          <section key={stage} className="flex w-[280px] shrink-0 flex-col gap-3">
            <header className="flex items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-2 text-[12.5px] font-semibold leading-tight text-text-muted">
                <Skeleton className="h-2 w-2 rounded-full" />
                {t.enums.caseStage[stage]}
              </span>
              <Skeleton className="h-5 w-7 rounded-full" />
            </header>
            <div className="flex flex-col gap-2.5 rounded-card bg-surface-sunken/50 p-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <article
                  key={i}
                  className="rounded-xl border border-border bg-surface shadow-sm"
                >
                  <div className="flex flex-col gap-2 px-3 pb-2 pt-3">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
