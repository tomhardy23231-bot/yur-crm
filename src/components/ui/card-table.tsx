import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import { type SortDir } from '@/components/ui/sortable-header';

// «Карточки-строки» — десктоп-представление списков (дела, клиенты): каждая
// строка парит отдельной карточкой на сером paper-фоне (эталон-скрин заказчика),
// вместо плотной таблицы в одном контейнере. Семантика таблицы сохранена через
// role=table/row/columnheader/cell; выравнивание шапки и строк — общий
// grid-template-columns (передаётся через `cols`).
//
// Внутренняя сетка держит минимальную ширину (minWidth), чтобы колонки не
// схлопывались; на узких экранах горизонтальный скролл даёт сама контент-зона
// app-shell (page-content, overflow-y-auto → x тоже auto). Свой overflow-x-auto
// здесь убран (v3 s10): предок с overflow — scroll container, внутри которого
// position:sticky шапки не работал бы. Шапка липнет к верху контент-зоны
// (топбар — выше неё, поэтому top-0); pb/-mb перекрывают gap-2 фоном при
// прилипании. Сами строки — клиентский <ClickableCard>; шапка, сорт-заголовки
// и иконки-действия — серверные.

export function CardListShell({
  cols,
  header,
  ariaLabel,
  minWidth = 1100,
  children,
  className,
}: {
  cols: string;
  header: React.ReactNode;
  ariaLabel?: string;
  /** px-число или CSS-выражение (напр. var(--cases-minw, 1376px)). */
  minWidth?: number | string;
  children: React.ReactNode;
  className?: string;
}) {
  // Каркас 2026-07-13: список — ОДНА карточка-контейнер (rounded-card, мягкая
  // тень), строки внутри разделены тонкими бордерами; шапка — светло-синяя
  // primary-subtle (sunken сливался с paper-фоном страницы, правка 21.07).
  return (
    <div className={cn('hidden pb-1 md:block', className)}>
      <div
        role="table"
        aria-label={ariaLabel}
        style={{ minWidth }}
        className="overflow-hidden rounded-card border border-border bg-surface shadow-sm"
      >
        <div
          role="row"
          style={{ gridTemplateColumns: cols }}
          className="sticky top-0 z-10 grid items-center gap-3 border-b border-primary-border bg-primary-subtle px-4 py-1"
        >
          {header}
        </div>
        {children}
      </div>
    </div>
  );
}

// Подпись колонки (несортируемая). dataCol — id колонки для настраиваемой
// видимости (см. cases-view-settings + globals.css).
export function CardHead({
  children,
  align = 'left',
  className,
  dataCol,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  dataCol?: string;
}) {
  return (
    <div
      role="columnheader"
      data-col={dataCol}
      className={cn(
        // Тёмно-синий на primary-subtle подложке шапки (AA ≈ 7.6:1)
        'text-[11px] font-semibold uppercase tracking-wide text-primary-pressed',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Сортируемая подпись колонки — зеркало SortableHeader, но в grid (без <th>).
// Серверный async-компонент: статичный Link с предвычисленным href.
export async function CardSortHead({
  column,
  currentSort,
  currentDir,
  hrefFor,
  align = 'left',
  children,
  dataCol,
}: {
  column: string;
  currentSort: string | null;
  currentDir: SortDir;
  hrefFor: (sort: string, dir: SortDir) => string;
  align?: 'left' | 'right';
  children: React.ReactNode;
  dataCol?: string;
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
    <div role="columnheader" aria-sort={ariaSort} data-col={dataCol} className={cn(align === 'right' && 'text-right')}>
      <Link
        href={href}
        scroll={false}
        className={cn(
          'inline-flex select-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide',
          align === 'right' && 'flex-row-reverse',
          isActive
            ? 'text-text'
            : 'text-primary-pressed transition-colors duration-[80ms] hover:text-text',
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
        <span>{children}</span>
        <Icon size={12} strokeWidth={2} className={cn('shrink-0', !isActive && 'opacity-60')} aria-hidden="true" />
      </Link>
    </div>
  );
}

// Иконка-действие в правой колонке карточки (открыть · история · редактировать).
// Настоящий <Link> — клик по нему ClickableCard игнорирует (правило INTERACTIVE).
export function RowAction({
  href,
  label,
  icon,
  external = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-subtle transition-colors hover:bg-primary-subtle hover:text-primary-pressed"
    >
      {icon}
    </Link>
  );
}
