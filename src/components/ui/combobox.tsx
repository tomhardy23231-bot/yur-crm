'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ComboboxOption = { value: string; label: string };

interface ComboboxProps {
  options: ReadonlyArray<ComboboxOption>;
  /** Имя hidden-input — значение уходит в FormData, как у нативного селекта. */
  name?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Подпись кнопки, пока ничего не выбрано. */
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  disabled?: boolean;
  className?: string;
}

// Комбобокс на cmdk: кнопка-триггер в стиле Select + выпадающая панель с
// поиском и КЛИЕНТСКОЙ фильтрацией. Для списков, где нативному селекту тесно
// (например, выбор дела из сотен строк). Значение отдаётся через hidden input.
export function Combobox({
  options,
  name,
  defaultValue,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // id выпадающего списка для aria-controls (WAI-ARIA combobox pattern;
  // элемент существует только при открытой панели — это допустимо).
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  // Клик вне панели закрывает её (слушаем только пока открыта).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(next: string) {
    setValue(next);
    onChange?.(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {name !== undefined && (
        <input type="hidden" name={name} value={value} readOnly />
      )}

      <button
        type="button"
        ref={triggerRef}
        id={id}
        disabled={disabled}
        // role=combobox: корректная ARIA-роль триггера (поддерживает aria-invalid).
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group inline-flex h-10 w-full items-center justify-between gap-2',
          'rounded-md border border-transparent bg-surface-muted',
          'pl-3 pr-3 text-base font-sans md:text-sm text-text',
          'transition-[border-color,background-color,box-shadow] duration-[180ms] ease-out',
          'hover:bg-surface hover:border-border',
          'focus:outline-none focus:bg-surface focus:border-primary focus:ring-[3px] focus:ring-primary-subtle',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'aria-invalid:border-error aria-invalid:focus:ring-error/15',
          'cursor-pointer',
          open && 'bg-surface border-primary',
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            !selected && 'text-text-subtle',
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn(
            'shrink-0 text-text-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Гард для модалок: помечаем ESC обработанным (defaultPrevented),
              // чтобы Modal поверх не закрылся вместе с панелью (см. ui/modal.tsx).
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <Command>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search
                size={14}
                strokeWidth={1.75}
                className="shrink-0 text-text-muted"
              />
              <Command.Input
                autoFocus
                placeholder={searchPlaceholder}
                className="h-9 flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-text-subtle"
              />
            </div>
            <Command.List id={listboxId} className="max-h-56 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-center text-[12.5px] text-text-muted">
                {emptyText}
              </Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  // label — для фильтрации cmdk, value — для уникальности.
                  value={`${o.label}__${o.value}`}
                  onSelect={() => choose(o.value)}
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 rounded-card px-2.5 py-1.5',
                    'text-[13.5px] text-text outline-none',
                    'data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && (
                    <Check
                      size={15}
                      strokeWidth={2.25}
                      className="shrink-0 text-primary"
                    />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
