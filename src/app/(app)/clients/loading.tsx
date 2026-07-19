import { ListingSkeleton } from '@/components/ui/skeleton';

// Список клиентов: поиск + кнопка, 4 pill-фильтра типа, 7 колонок.
export default function ClientsLoading() {
  return <ListingSkeleton chips={4} filterCount={0} columns={7} rows={8} />;
}
