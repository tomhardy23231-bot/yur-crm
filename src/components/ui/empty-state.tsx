import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// ============================================================================
// Единый empty-state (v3 Сессия 11): один вид «пусто» для списков, секций
// карточки дела, кассы и отчётов. Тексты приходят из словарей вызывающего
// экрана (у списков ДВА состояния: «пусто вообще» и «не найдено по фильтрам»).
// Без своей карточки-обёртки: родитель сам решает, во что завернуть
// (Card-секция уже имеет рамку; отдельные экраны — свою).
// ============================================================================

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  /** Опциональная CTA-кнопка (напр. «Новое дело»). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <Icon
          size={28}
          strokeWidth={1.5}
          className="mb-3 text-text-subtle"
          aria-hidden="true"
        />
      )}
      <p className="text-[14px] font-medium text-text">{title}</p>
      {hint && (
        <p className="mt-1 max-w-md text-[13px] text-text-muted">{hint}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
