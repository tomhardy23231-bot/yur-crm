'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}

// Тумблер «вкл/выкл» (WAI-ARIA switch). Вкл — success (зелёный = разрешено),
// выкл — серый. Введён для персональных прав на карточке сотрудника
// (/settings/users/[id]); семантику цвета выбрал владелец 2026-07-16.
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full',
        'transition-colors duration-200',
        checked ? 'bg-success' : 'bg-border-strong',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
