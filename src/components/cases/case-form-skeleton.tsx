import { Skeleton } from '@/components/ui/skeleton';

// Скелет формы дела (создание/правка) — зеркало CaseForm + CaseFormAside:
// слева 4 секции-карточки с кружком-номером, справа sticky-сайдбар (xl+).
// Используется в cases/new/loading.tsx и cases/[id]/edit/loading.tsx.

function FieldSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={wide ? 'flex flex-col gap-1.5 sm:col-span-2' : 'flex flex-col gap-1.5'}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-full rounded-control" />
    </div>
  );
}

function SectionShell({
  children,
  fields,
}: {
  children?: React.ReactNode;
  fields?: number;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-border pb-3">
        <Skeleton className="h-7 w-7 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      {fields ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <FieldSkeleton wide />
          {Array.from({ length: fields - 1 }).map((_, i) => (
            <FieldSkeleton key={i} />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function CaseFormSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-5">
      <div className="flex flex-col gap-4">
        {/* 1. Базовые поля */}
        <SectionShell fields={9} />

        {/* 2. Финансы: сумма + чекбокс-чипы форм оплаты */}
        <SectionShell>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <FieldSkeleton />
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-control" />
              ))}
            </div>
          </div>
        </SectionShell>

        {/* 3. Судебная информация */}
        <SectionShell fields={3} />

        {/* 4. Дополнительно: textarea */}
        <SectionShell>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-16 w-full rounded-control" />
          </div>
        </SectionShell>

        <div className="flex items-center gap-3 pt-1">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>

      {/* Sticky-сайдбар подсказок (xl+) */}
      <aside className="sticky top-12 hidden flex-col gap-4 xl:flex">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[80%]" />
            <Skeleton className="h-3.5 w-[60%]" />
          </div>
        ))}
      </aside>
    </div>
  );
}
