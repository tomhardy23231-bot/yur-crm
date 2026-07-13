import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// ============================================================================
// Единый empty-state (v3 Сессия 11): один вид «пусто» для списков, секций
// карточки дела, кассы и отчётов. Тексты приходят из словарей вызывающего
// экрана (у списков ДВА состояния: «пусто вообще» и «не найдено по фильтрам»).
// Без своей карточки-обёртки: родитель сам решает, во что завернуть
// (Card-секция уже имеет рамку; отдельные экраны — свою).
// size='sm' — компактный вариант для узких блоков (колонки канбана,
// карточки дашборда): меньше вертикали и иконка 22px.
// ============================================================================

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  size = 'md',
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  /** Опциональная CTA-кнопка (напр. «Новое дело»). */
  action?: ReactNode;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const sm = size === 'sm';
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        sm ? 'px-4 py-6' : 'px-6 py-10',
        className,
      )}
    >
      {Icon && (
        <Icon
          size={sm ? 22 : 28}
          strokeWidth={1.5}
          className={cn('text-text-subtle', sm ? 'mb-2' : 'mb-3')}
          aria-hidden="true"
        />
      )}
      <p className={cn('font-medium text-text', sm ? 'text-[13.5px]' : 'text-[14px]')}>
        {title}
      </p>
      {hint && (
        <p className={cn('mt-1 max-w-md text-text-muted', sm ? 'text-[12.5px]' : 'text-[13px]')}>
          {hint}
        </p>
      )}
      {action && <div className={sm ? 'mt-3' : 'mt-4'}>{action}</div>}
    </div>
  );
}
