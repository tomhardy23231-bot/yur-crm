import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "px-2.5 py-0.5 rounded-full",
    "text-xs font-semibold leading-tight",
    "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:shrink-0",
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
    },
    defaultVariants: { tone: "neutral" },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
