import { Skeleton } from '@/components/ui/skeleton';

// Скелет формы клиента (создание/правка) — зеркало ClientForm: одна карточка
// с гридом ~11 полей (sm:2 / lg:3 колонки), textarea-заметки и футер-кнопки.
// Используется в clients/new/loading.tsx и clients/[id]/edit/loading.tsx.

export function ClientFormSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-sm sm:p-6 lg:p-8">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-control" />
            </div>
          ))}
          {/* Заметки — textarea на всю ширину */}
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-24 w-full rounded-control" />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}
