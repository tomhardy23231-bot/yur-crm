import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

// KPI-карточка (эталон «ЮрКейс», бриф §6): капс-лейбл · крупное mono-число ·
// дельта к прошлому периоду (▲/▼) · строка-контекст. У денежных метрик —
// спарклайн справа. Вся карточка — ссылка на отфильтрованный список:
// hover-подъём + уголковая стрелка.

export type KpiDelta = {
  direction: "up" | "down" | "flat";
  /** Цвет дельты по смыслу: рост выручки зелёный, рост долга красный. */
  tone: "money" | "debt" | "neutral";
  /** Уже отформатированный текст: «+18%» / «+1» / «0». */
  text: string;
  /** Подпись периода, напр. «к маю». */
  label?: string;
};

export type KpiSpark = {
  points: number[];
  tone: "money" | "debt";
};

const DELTA_TONE: Record<KpiDelta["tone"], string> = {
  money: "text-success bg-success-bg",
  debt: "text-error bg-error-bg",
  neutral: "text-text-muted bg-surface-sunken",
};

function DeltaMark({ direction }: { direction: KpiDelta["direction"] }) {
  if (direction === "flat") {
    return <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-0 w-0 border-l-[4px] border-r-[4px] border-l-transparent border-r-transparent",
        direction === "up" ? "border-b-[5px] border-b-current" : "border-t-[5px] border-t-current",
      )}
    />
  );
}

function Sparkline({ points, tone }: KpiSpark) {
  const W = 66;
  const H = 28;
  const pad = 3;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const n = points.length;
  const coords = points.map((v, i) => {
    const x = n <= 1 ? W - pad : pad + (i / (n - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const stroke = tone === "debt" ? "var(--error)" : "var(--success)";
  const last = coords[coords.length - 1] ?? [W - pad, H / 2];
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="mb-0.5 shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={stroke} />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  context,
  href,
  delta,
  spark,
  valueTone = "default",
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: string;
  href?: string;
  delta?: KpiDelta;
  spark?: KpiSpark;
  valueTone?: "default" | "debt";
  className?: string;
}) {
  const base = cn(
    "group relative block rounded-lg border border-border bg-surface px-4 py-3.5 shadow-sm",
    "transition-[border-color,box-shadow,transform] duration-[150ms] ease-out",
    href &&
      "hover:-translate-y-px hover:border-primary-border hover:shadow-md focus-visible:-translate-y-px",
    className,
  );

  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-text-subtle">
        {label}
      </p>
      <div className="my-2 flex items-end justify-between gap-2.5">
        <p
          className={cn(
            "font-mono text-[27px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
            valueTone === "debt" ? "text-error" : "text-text",
          )}
        >
          {value}
          {unit && <span className="ml-0.5 text-[15px] text-text-subtle">{unit}</span>}
        </p>
        {spark && spark.points.length > 0 && <Sparkline {...spark} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[12px] font-semibold",
              DELTA_TONE[delta.tone],
            )}
          >
            <DeltaMark direction={delta.direction} />
            {delta.text}
          </span>
        )}
        {context && <span className="text-[11.5px] text-text-subtle">{context}</span>}
      </div>
      {href && (
        <ArrowUpRight
          size={15}
          strokeWidth={2.2}
          aria-hidden="true"
          className="absolute right-3.5 top-3.5 text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      )}
    </>
  );

  return href ? (
    <Link href={href} className={base}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
