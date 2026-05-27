import { ListingSkeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <ListingSkeleton
      title="Клиенты"
      filterCount={1}
      columns={6}
      rows={8}
    />
  );
}
