import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

// Нативный <select> в стиле Input. Для поиска/мульти позже подключим Radix Select.
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div className="relative inline-flex w-full">
      <select
        ref={ref}
        className={cn(
          'appearance-none flex h-10 w-full',
          // 16px на мобильных — чтобы iOS Safari не зумил при фокусе; 14px на ≥ md.
          'pl-3 pr-9 text-base font-sans md:text-sm',
          'bg-surface-muted text-text',
          'border border-transparent rounded-md',
          'transition-[border-color,background-color,box-shadow] duration-[180ms] ease-out',
          'hover:bg-surface hover:border-border',
          'focus:outline-none focus:bg-surface focus:border-primary focus:ring-[3px] focus:ring-primary-subtle',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'aria-invalid:border-error aria-invalid:focus:ring-error/15',
          'cursor-pointer',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
    </div>
  );
});
Select.displayName = 'Select';

export { Select };
