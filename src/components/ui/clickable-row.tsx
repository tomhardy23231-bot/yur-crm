'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface ClickableRowProps
  extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Куда вести при клике по строке. */
  href: string;
}

// Интерактивные потомки, по которым клик НЕ должен навигировать строку
// (ссылка на клиента, кнопки действий, поля ввода). Пометить произвольный
// элемент `data-no-row-nav`, чтобы исключить его вручную.
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [data-no-row-nav]';

// Строка-ссылка: клик по любому месту ведёт на href. Доступная навигация
// остаётся на реальном <Link> внутри строки (Tab + Enter, открытие в новой
// вкладке), здесь — удобство мыши + Cmd/Ctrl-клик в новой вкладке.
export function ClickableRow({
  href,
  onClick,
  children,
  className,
  ...props
}: ClickableRowProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Клики по вложенным интерактивным элементам обрабатывают они сами.
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
    <TableRow
      onClick={handleClick}
      className={cn(
        // Hover-язык каркаса v5: строки «синеют» брендовым тинтом (не серым);
        // group — чтобы ячейки могли реагировать на hover строки.
        'group cursor-pointer hover:bg-primary-softer',
        className,
      )}
      {...props}
    >
      {children}
    </TableRow>
  );
}
