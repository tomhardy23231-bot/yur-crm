import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type KpiTone = "default" | "primary" | "success" | "error" | "warning";

const TONE: Record<KpiTone, { chip: string; foot: string }> = {
  default: { chip: "text-text-muted bg-surface-sunken", foot: "text-text-subtle" },
  primary: { chip: "text-primary bg-primary-subtle", foot: "text-text-subtle" },
  success: { chip: "text-success bg-success-bg", foot: "text-success" },
  error: { chip: "text-error bg-error-bg", foot: "text-error" },
  warning: { chip: "text-warning bg-warning-bg", foot: "text-text-subtle" },
};

// Плитка метрики (эталон «ЮрКейс»): цветная иконка-квадрат слева, справа —
// лейбл, крупное mono-значение и подпись. Значение всегда тёмное; цвет несут
// иконка и подпись (зелёный — деньги, красный — долг).
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-md border border-border bg-surface px-4 py-3.5 shadow-sm",
        "transition-shadow duration-[180ms] ease-out hover:shadow-md",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
          t.chip,
        )}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-tight text-text-muted">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-[21px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-text">
          {value}
        </p>
        {hint && <p className={cn("mt-1 text-[11.5px]", t.foot)}>{hint}</p>}
      </div>
    </div>
  );
}
