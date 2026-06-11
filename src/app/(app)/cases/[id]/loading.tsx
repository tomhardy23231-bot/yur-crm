import { Skeleton } from '@/components/ui/skeleton';

// Скелет карточки дела (v3 Сессия 6): шапка (заголовок, этап, мета,
// инфо-сетка) + три секции-карточки (комментарии · акты/документы · задачи).
export default function CaseCardLoading() {
  return (
    <main
      className="flex flex-col gap-4 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      {/* Шапка дела */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-6 w-72 max-w-full" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-3.5 w-36" />
            </div>
          ))}
        </div>
      </div>

      {/* Три секции-скелета */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm"
        >
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3.5 w-full max-w-2xl" />
          <Skeleton className="h-3.5 w-full max-w-xl" />
          <Skeleton className="h-3.5 w-full max-w-lg" />
        </div>
      ))}
    </main>
  );
}
