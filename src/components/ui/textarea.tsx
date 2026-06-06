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
        'bg-surface-muted text-text',
        'border border-transparent rounded-md',
        'placeholder:text-text-subtle',
        'transition-[border-color,background-color,box-shadow] duration-[180ms] ease-out',
        'hover:bg-surface hover:border-border',
        'focus:outline-none focus:bg-surface focus:border-primary focus:ring-[3px] focus:ring-primary-subtle',
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
