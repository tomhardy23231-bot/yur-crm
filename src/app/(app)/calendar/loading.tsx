import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getT } from '@/lib/i18n/server';

// Скелет календаря (каркас 2026-07-13): шапка-месяц + навигация с сегментом и
// легендой + месячная сетка ПЛИТОК (rounded-lg/xl с зазорами в карточке,
// Сб/Вс — красные заголовки). Дни недели — настоящие.
export default async function CalendarLoading() {
  const { t } = await getT();
  const w = t.calendar.weekdays;
  const weekdays = [w.mon, w.tue, w.wed, w.thu, w.fri, w.sat, w.sun];

  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="ml-1 h-9 w-40 rounded-xl" />
        <div className="ml-auto flex items-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>

      <Card className="p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekdays.map((d, i) => (
            <div
              key={d}
              className={`px-1 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] ${
                i >= 5 ? 'text-error' : 'text-text-subtle'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[58px] flex-col gap-1.5 rounded-lg border border-border bg-surface p-1 sm:min-h-[92px] sm:rounded-xl sm:p-2"
            >
              <Skeleton className="h-3 w-5" />
              {i % 4 === 0 && <Skeleton className="hidden h-3.5 w-full rounded-md sm:block" />}
              {i % 7 === 2 && <Skeleton className="hidden h-3.5 w-[80%] rounded-md sm:block" />}
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
