import { ListingSkeleton } from '@/components/ui/skeleton';

export default function CasesLoading() {
  return (
    <ListingSkeleton
      title="Дела"
      filterCount={3}
      columns={9}
      rows={8}
    />
  );
}
