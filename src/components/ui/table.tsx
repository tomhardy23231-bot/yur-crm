import * as React from 'react';

import { cn } from '@/lib/utils';

// Плотная таблица — 44px ряд, sticky header, hover row (DESIGN.md §7).
//
// Sticky-thead требует, чтобы единственным скролл-контейнером был ВНЕШНИЙ
// враппер (с overflow-auto + max-height). Если обернуть Table ещё одним
// overflow-* div'ом, sticky сломается — будет нестед-скролл-контекст
// без констрейнта высоты. Так что Table сам не оборачивается.

// border-separate (v3 s10): при border-collapse границы рисуются на сетке
// таблицы и «отстают» от sticky-шапки при скролле. С separate граница живёт
// на самих ячейках (th/td) и едет вместе с ними; на tr/thead границы при
// separate не рисуются вовсе — поэтому border-b перенесён с TableRow/TableHeader
// на TableHead/TableCell (последний ряд гасится через TableBody).
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn('w-full border-separate border-spacing-0 text-sm', className)}
      {...props}
    />
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        'bg-surface sticky top-0 z-[1]',
        className,
      )}
      {...props}
    />
  ),
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn('[&>tr:last-child>td]:border-b-0', className)}
      {...props}
    />
  ),
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors duration-[80ms] ease-out',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 text-left border-b border-border',
        'text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle',
        'whitespace-nowrap',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('h-11 px-4 align-middle text-[13.5px] text-text border-b border-border', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
};
