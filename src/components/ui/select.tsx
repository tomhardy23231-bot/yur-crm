'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

// Select на Radix вместо нативного <select>: открытое меню рисуется НАМИ (в стиле
// CRM), а не операционной системой. API совместим с нативным — компонент
// принимает <option>-детей и те же пропсы (name / value / defaultValue / onChange
// / required / disabled / aria-invalid / id / aria-label / className), поэтому все
// прежние места (формы и фильтры) работают без переписывания.
//
// Пустое значение: Radix запрещает <Select.Item value="">. Внутри пустую строку
// маппим на sentinel, а в форму отдаём НАСТОЯЩЕЕ значение (в т.ч. "") через
// собственный hidden <input name> — серверные actions получают то же, что и
// раньше. Поиск/мульти при необходимости добавим поверх Radix позже.

const EMPTY = '__select_empty__';
const toRadix = (v: string) => (v === '' ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? '' : v);

interface Opt {
  value: string;
  label: React.ReactNode;
  textLabel: string;
  disabled?: boolean;
}

// Достаём опции из <option>-детей (плоский список + фрагменты + массивы .map()).
function collectOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      const label = props.children;
      const value = String(props.value ?? '');
      out.push({
        value,
        label,
        textLabel: typeof label === 'string' ? label : value,
        disabled: props.disabled,
      });
    } else if (child.type === React.Fragment) {
      out.push(
        ...collectOptions(
          (child.props as { children?: React.ReactNode }).children,
        ),
      );
    }
  });
  return out;
}

export interface SelectProps {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: {
    target: { value: string; name?: string };
    currentTarget: { value: string; name?: string };
  }) => void;
  required?: boolean;
  disabled?: boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Select({
  name,
  id,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  children,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: SelectProps) {
  const options = React.useMemo(() => collectOptions(children), [children]);
  const isControlled = value !== undefined;

  const firstValue = options[0]?.value ?? '';
  const [internal, setInternal] = React.useState<string>(
    defaultValue ?? firstValue,
  );
  const current = isControlled ? (value as string) : internal;

  const hiddenRef = React.useRef<HTMLInputElement>(null);

  // Нативный form.reset() не трогает React-state и контролируемый hidden input,
  // поэтому uncontrolled-Select сам по себе не вернулся бы к defaultValue после
  // сброса формы (напр. форма загрузки документа после успешной отправки).
  // Слушаем 'reset' своей формы и восстанавливаем значение по умолчанию.
  React.useEffect(() => {
    if (isControlled) return;
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => setInternal(defaultValue ?? firstValue);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [isControlled, defaultValue, firstValue]);

  function handleValueChange(radixValue: string) {
    const real = fromRadix(radixValue);
    // Синхронно пишем в hidden input ДО onChange — если обработчик зовёт
    // requestSubmit() (авто-сабмит роли в таблице), форма увидит новое значение.
    if (hiddenRef.current) hiddenRef.current.value = real;
    if (!isControlled) setInternal(real);
    onChange?.({
      target: { value: real, name },
      currentTarget: { value: real, name },
    });
  }

  // Подпись плейсхолдера — из опции с пустым значением, если она есть.
  const placeholderOpt = options.find((o) => o.value === '');

  return (
    <>
      {name !== undefined && (
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          value={current}
          readOnly
        />
      )}
      <SelectPrimitive.Root
        value={toRadix(current)}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-required={required || undefined}
          className={cn(
            'group inline-flex h-10 w-full items-center justify-between gap-2',
            // Редизайн 2026-06-12 (Волна 0): белый триггер + видимая граница (см. input.tsx).
            'rounded-control border border-border bg-surface',
            'pl-3 pr-3 text-base font-sans md:text-sm text-text',
            'transition-[border-color,box-shadow] duration-[200ms] ease-out',
            'hover:border-border-strong',
            'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
            'data-[state=open]:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'aria-invalid:border-error aria-invalid:focus:ring-error/15',
            'cursor-pointer',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            <SelectPrimitive.Value placeholder={placeholderOpt?.textLabel ?? ''} />
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-text-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className={cn(
              'z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-lg',
              'max-h-[min(var(--radix-select-content-available-height),22rem)]',
              'min-w-[var(--radix-select-trigger-width)]',
              'data-[state=open]:animate-[stage-menu-in_140ms_var(--ease-out)]',
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-text-muted">
              <ChevronDown size={14} strokeWidth={2} className="rotate-180" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1">
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value || EMPTY}
                  value={toRadix(o.value)}
                  disabled={o.disabled}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center rounded-lg',
                    'py-1.5 pl-3 pr-8 text-[13.5px] text-text outline-none',
                    'data-[highlighted]:bg-primary-softer data-[highlighted]:text-primary-pressed',
                    'data-[state=checked]:font-semibold',
                    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                  )}
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex">
                    <Check size={15} strokeWidth={2.25} className="text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-text-muted">
              <ChevronDown size={14} strokeWidth={2} />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  );
}
