import { CASE_PRIORITY_LABEL, type CasePriority } from '@/lib/types/db';
import { cn } from '@/lib/utils';

// Приоритет в таблице (бриф §7): точка + текст. «Срочный» — красным,
// «Обычный» — приглушённо. Без заливки, чтобы плотная таблица не шумела.
export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const urgent = priority === 'urgent';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold',
        urgent ? 'text-error' : 'text-text-subtle',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', urgent ? 'bg-error' : 'bg-text-subtle')}
      />
      {CASE_PRIORITY_LABEL[priority]}
    </span>
  );
}
