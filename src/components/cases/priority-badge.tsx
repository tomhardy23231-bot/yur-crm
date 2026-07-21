'use client';

import { type CasePriority } from '@/lib/types/db';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';

// Приоритет в таблице (бриф §7): точка + текст. «Срочный» — красным,
// «Обычный» — тёмным текстом с серой точкой. Без заливки, чтобы плотная
// таблица не шумела.
export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const { t } = useI18n();
  const urgent = priority === 'urgent';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold',
        urgent ? 'text-error' : 'text-text',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', urgent ? 'bg-error' : 'bg-text-muted')}
      />
      {t.enums.casePriority[priority]}
    </span>
  );
}
