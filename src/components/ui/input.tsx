import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-10 w-full",
          // 16px на мобильных — чтобы iOS Safari не зумил при фокусе; 14px на ≥ md.
          "px-3 py-2 text-base font-sans md:text-sm",
          // Редизайн 2026-06-12 (Волна 0): белое поле + видимая граница вместо
          // серой заливки без бордера («1С-look»). Фокус — синяя граница + кольцо.
          "bg-surface text-text",
          "border border-border rounded-control",
          "placeholder:text-text-subtle",
          "transition-[border-color,box-shadow] duration-[180ms] ease-out",
          "hover:border-border-strong",
          "focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-subtle",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "aria-invalid:border-error aria-invalid:focus:ring-error/15",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
