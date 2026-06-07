'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { cn } from '@/lib/utils';

// Интерактивные потомки, по которым клик НЕ навигирует карточку (ссылки на
// клиента, иконки-действия). Совпадает с правилом ClickableRow.
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [data-no-row-nav]';

interface ClickableCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Куда вести при клике по карточке. */
  href: string;
  /** grid-template-columns — общий с шапкой списка (выравнивание колонок). */
  cols: string;
}

// «Карточка-строка» десктоп-списка: вся карточка кликабельна (как ClickableRow,
// но на <div> — внутри есть настоящие <a>/<button>, что недопустимо вложить в
// <a>). Доступная навигация — на реальном <Link> внутри (Tab+Enter, новая
// вкладка по Cmd/Ctrl-клику). Сетка задаётся через `cols` (тот же, что у шапки).
export function ClickableCard({
  href,
  cols,
  onClick,
  children,
  className,
  style,
  ...props
}: ClickableCardProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    // Не мешаем выделению текста мышью.
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank');
      return;
    }
    router.push(href);
  };

  return (
    <div
      role="row"
      onClick={handleClick}
      style={{ gridTemplateColumns: cols, ...style }}
      className={cn(
        'group grid cursor-pointer items-center gap-3',
        'rounded-lg border border-border bg-surface px-4 py-3 shadow-sm',
        // Без transform на hover: при скролле карточки «подпрыгивали» под
        // курсором. Оставляем только смену границы/тени (дёшево, без дёрганья).
        'transition-[box-shadow,border-color] duration-150 ease-out',
        'hover:border-border-strong hover:shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
