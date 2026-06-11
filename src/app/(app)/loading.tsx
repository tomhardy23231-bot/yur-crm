import { Skeleton } from '@/components/ui/skeleton';

// Generic-фолбэк рабочей зоны (v3 Сессия 6): накрывает дашборд и все маршруты
// без собственного loading.tsx. Нейтральный центрированный каркас — заголовок,
// ряд KPI-плиток и две карточки-секции.
export default function AppLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 shadow-sm"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-full max-w-xl" />
          <Skeleton className="h-3.5 w-full max-w-md" />
          <Skeleton className="h-3.5 w-full max-w-lg" />
        </div>
      ))}
    </main>
  );
}
