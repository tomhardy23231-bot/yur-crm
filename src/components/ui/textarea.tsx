import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full min-h-[88px]',
        // 16px на мобильных — чтобы iOS Safari не зумил при фокусе; 14px на ≥ md.
        'px-3 py-2 text-base font-sans leading-[1.55] md:text-sm',
        // Редизайн 2026-06-12 (Волна 0): белое поле + видимая граница (см. input.tsx).
        'bg-surface text-text',
        'border border-border rounded-control',
        'placeholder:text-text-subtle',
        'transition-[border-color,box-shadow] duration-[200ms] ease-out',
        'hover:border-border-strong',
        'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'aria-invalid:border-error aria-invalid:focus:ring-error/15',
        'resize-y',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
