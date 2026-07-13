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
        <span
          className={cn(
            // Иконка в синем тинт-квадрате (каркас 2026-07-13).
            'flex items-center justify-center rounded-xl bg-primary-subtle text-primary',
            sm ? 'mb-2 h-9 w-9' : 'mb-3 h-12 w-12',
          )}
          aria-hidden="true"
        >
          <Icon size={sm ? 16 : 20} strokeWidth={2} />
        </span>
      )}
      <p className={cn('font-semibold text-text', sm ? 'text-[13.5px]' : 'text-[14px]')}>
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
