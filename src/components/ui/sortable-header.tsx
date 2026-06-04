import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

// Серверный компонент: статичный Link с предвычисленным href.
// hrefFor вызывается синхронно в родителе — никакого client JS не требуется.
// Цикл сортировки: не-активна → asc → desc → asc → desc → … (без сброса).
export async function SortableHeader({
  column,
  currentSort,
  currentDir,
  hrefFor,
  align = 'left',
  children,
}: {
  column: string;
  currentSort: string | null;
  currentDir: SortDir;
  hrefFor: (sort: string, dir: SortDir) => string;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const { t, fmt } = await getT();
  const isActive = currentSort === column;
  const nextDir: SortDir = isActive && currentDir === 'asc' ? 'desc' : 'asc';
  const href = hrefFor(column, nextDir);

  const Icon = !isActive ? ArrowUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown;
  const ariaSort: 'ascending' | 'descending' | 'none' = !isActive
    ? 'none'
    : currentDir === 'asc'
      ? 'ascending'
      : 'descending';

  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined} aria-sort={ariaSort}>
      <Link
        href={href}
        scroll={false}
        className={cn(
          'inline-flex items-center gap-1.5 select-none',
          align === 'right' && 'flex-row-reverse',
          isActive
            ? 'text-text'
            : 'text-text-subtle hover:text-text transition-colors duration-[80ms]',
        )}
        aria-label={fmt(t.ui.sort.label, {
          column: typeof children === 'string' ? children : column,
          state: isActive
            ? currentDir === 'asc'
              ? t.ui.sort.ascending
              : t.ui.sort.descending
            : t.ui.sort.none,
        })}
      >
        <span className={cn(isActive && 'font-semibold')}>{children}</span>
        <Icon
          size={12}
          strokeWidth={2}
          className={cn('shrink-0', !isActive && 'opacity-60')}
          aria-hidden="true"
        />
      </Link>
    </TableHead>
  );
}
