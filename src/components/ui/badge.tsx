import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "px-2.5 py-0.5 rounded-full",
    "text-xs font-semibold leading-tight",
  ],
  {
    variants: {
      tone: {
        success:   "text-success   bg-success-bg",
        warning:   "text-warning   bg-warning-bg",
        error:     "text-error     bg-error-bg",
        info:      "text-info      bg-info-bg",
        "prio-low":  "text-prio-low  bg-prio-low-bg",
        "prio-mid":  "text-prio-mid  bg-prio-mid-bg",
        "prio-high": "text-prio-high bg-prio-high-bg",
        neutral:   "text-text-muted bg-surface-muted",
      },
      // .quiet (бриф §3.4) — для плотных таблиц: цветная точка + тёмный текст,
      // без заливки. Насыщенные заливки оставляем там, где элементов мало.
      quiet: {
        true:  "bg-transparent px-0.5 text-text",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", quiet: false },
  },
);

// Цвет точки по тону — в .quiet точка несёт семантику, а текст остаётся тёмным.
const DOT: Record<NonNullable<BadgeProps["tone"]>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  "prio-low": "bg-prio-low",
  "prio-mid": "bg-prio-mid",
  "prio-high": "bg-prio-high",
  neutral: "bg-text-subtle",
};

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone = "neutral", quiet, children, ...props }: BadgeProps) {
  const t = tone ?? "neutral";
  return (
    <span className={cn(badgeVariants({ tone: t, quiet }), className)} {...props}>
      <span
        aria-hidden="true"
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          quiet ? DOT[t] : "bg-current",
        )}
      />
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
