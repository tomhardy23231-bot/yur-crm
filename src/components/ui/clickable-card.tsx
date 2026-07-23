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

// Строка кликабельного списка (каркас 2026-07-13): строки живут внутри ОДНОЙ
// карточки-контейнера (CardListShell), разделены тонкими бордерами. Hover —
// паттерн `.row-lift` (globals.css, эталон «СРМ Вадима» 2026-07-23):
// плавная синяя заливка + лёгкий подъём + скруглённая полоска-«скобка»
// у левого края.
// Вся строка кликабельна (как ClickableRow,
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
        // py-2 (была py-3): строки компактнее по высоте, шрифты прежние
        // (просьба владельца 23.07).
        'group grid cursor-pointer items-center gap-3 px-4 py-2',
        'border-b border-border/60 last:border-b-0',
        'row-lift',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
