import { Skeleton } from '@/components/ui/skeleton';
import { CASE_STAGES } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';

export default async function CasesBoardLoading() {
  const { t } = await getT();
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4 min-h-0"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-24 ml-auto" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
        {CASE_STAGES.map((stage) => (
          <section
            key={stage}
            className="flex flex-col w-[280px] shrink-0 bg-surface-muted/40 rounded-lg border border-border"
          >
            <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
              <span className="text-[12px] uppercase tracking-[0.05em] font-bold leading-tight text-text-subtle">
                {t.enums.caseStage[stage]}
              </span>
              <Skeleton className="h-5 w-6 rounded-full" />
            </header>
            <div className="p-2 flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-surface rounded-md border border-border shadow-sm p-3 flex flex-col gap-2"
                >
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <div className="flex items-center justify-between pt-1.5 border-t border-border -mx-3 px-3">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
