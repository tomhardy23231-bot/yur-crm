import { Skeleton } from '@/components/ui/skeleton';
import { CaseFormSkeleton } from '@/components/cases/case-form-skeleton';

// Скелет правки дела: back-link + строка названия + форма (4 секции + сайдбар).
export default function CaseEditLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-56 max-w-full" />
      </div>
      <CaseFormSkeleton />
    </main>
  );
}
