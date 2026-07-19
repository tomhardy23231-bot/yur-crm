import { ListingSkeleton } from '@/components/ui/skeleton';

// Список дел: поиск + сегмент, ряд пресетов-чипов + 3 селекта, 9 колонок.
export default function CasesLoading() {
  return <ListingSkeleton chips={3} filterCount={3} columns={9} rows={8} />;
}
