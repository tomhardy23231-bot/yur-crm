import { ListingSkeleton } from '@/components/ui/skeleton';

export default function CasesLoading() {
  return (
    <ListingSkeleton
      filterCount={3}
      columns={9}
      rows={8}
    />
  );
}
