import { Skeleton } from '@/components/ui/skeleton';
import { ClientFormSkeleton } from '@/components/clients/client-form-skeleton';

// Скелет создания клиента: back-link + карточка формы.
export default function ClientNewLoading() {
  return (
    <main
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
      aria-busy="true"
    >
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-28" />
      </div>
      <ClientFormSkeleton />
    </main>
  );
}
