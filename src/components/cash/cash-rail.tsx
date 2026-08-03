'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

// Рейка разделов кассы (каркас «Бухгалтерия», 2026-08-03).
//
// Заменяет ряд из 11 пилюль-вкладок: три счёта с суммами и восемь отчётов шли
// подряд одинаковыми чипами и переносились на две строки. Разделы сгруппированы
// по смыслу (где лежат деньги / что с ними стало / готовые отчёты), названия
// пишутся полностью — в колонке на это есть место.
//
// Тот же master–detail, что в /settings: рейка слева, контент справа.
// На мобильном колонка не помещается — сворачивается в одну кнопку с раскрытием.

export type RailItem = {
  id: string;
  label: string;
  /** Сумма справа от названия (остаток счёта, оборот раздела). */
  meta?: string;
  metaTone?: 'in' | 'out';
  /** Приписка мелким шрифтом после названия — напр. «неактивний». */
  note?: string;
  /** Якорь гайд-тура. */
  dataTour?: string;
};

export type RailGroup = {
  id: string;
  title: string;
  items: RailItem[];
};

export function CashRail({
  groups,
  active,
  onSelect,
  ariaLabel,
  mobileLabel,
}: {
  groups: RailGroup[];
  active: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** Подпись мобильной кнопки — «Розділ». */
  mobileLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel =
    groups.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? '';

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  // Список рисуется дважды (мобильная кнопка и десктопная колонка), поэтому
  // якоря тура ставим ТОЛЬКО в десктопной копии: иначе querySelector нашёл бы
  // первый — скрытый — элемент и тур подсветил бы пустоту.
  const renderList = (anchors: boolean) => (
    <div role="tablist" aria-label={ariaLabel} aria-orientation="vertical">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="px-2.5 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-text-subtle">
            {g.title}
          </p>
          {g.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === active}
              data-tour={anchors ? item.dataTour : undefined}
              onClick={() => pick(item.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-left text-[13px] transition-colors duration-[150ms]',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                item.id === active
                  ? 'bg-primary-subtle font-semibold text-primary-pressed'
                  : 'text-text-muted hover:bg-primary-softer hover:text-primary-pressed',
              )}
            >
              <span className="min-w-0 truncate">
                {item.label}
                {item.note && (
                  <span className="ml-1 text-[10px] font-normal opacity-70">
                    ({item.note})
                  </span>
                )}
              </span>
              {item.meta && (
                <span
                  className={cn(
                    'ml-auto shrink-0 font-mono text-[11.5px] font-semibold tabular-nums',
                    item.id === active
                      ? 'text-primary-pressed'
                      : item.metaTone === 'in'
                        ? 'text-success-text'
                        : item.metaTone === 'out'
                          ? 'text-error'
                          : 'text-text',
                  )}
                >
                  {item.meta}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div data-tour="cash-tabs" className="md:w-[218px] md:shrink-0">
      {/* Мобильный: одна кнопка вместо колонки — раскрывается тем же списком. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-card border border-border bg-surface px-3.5 py-2.5 text-[13px] shadow-sm transition-colors hover:border-primary-border"
        >
          <span className="text-text-subtle">{mobileLabel}:</span>
          <span className="min-w-0 truncate font-semibold text-text">{activeLabel}</span>
          <ChevronDown
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            className={cn(
              'ml-auto shrink-0 text-text-muted transition-transform duration-[200ms]',
              open && 'rotate-180',
            )}
          />
        </button>
        {open && (
          <div className="mt-2 rounded-card border border-border bg-surface p-2 shadow-sm">
            {renderList(false)}
          </div>
        )}
      </div>

      {/* Десктоп: колонка разделов. */}
      <aside className="hidden rounded-card border border-border bg-surface p-2 shadow-sm md:block">
        {renderList(true)}
      </aside>
    </div>
  );
}
