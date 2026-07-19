import { Skeleton } from '@/components/ui/skeleton';
import { CaseFormSkeleton } from '@/components/cases/case-form-skeleton';

// Скелет создания дела: back-link + форма (4 секции + sticky-сайдбар).
export default function CaseNewLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-28" />
      </div>
      <CaseFormSkeleton />
    </main>
  );
}
