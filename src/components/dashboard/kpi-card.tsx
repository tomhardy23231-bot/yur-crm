import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// KPI-карточка (эталон «ЮрКейс», бриф §6 + макет владельца 2026-07-08):
// капс-лейбл · иконка в цветном тинт-кружке справа · крупное число · дельта
// к прошлому периоду (▲/▼) · строка-контекст. У денежных метрик — спарклайн.
// Вся карточка — ссылка на отфильтрованный список (hover-подъём + рамка).

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

export type KpiIconTone = "primary" | "success" | "warning" | "error";

// Пары «тинт-подложка + тёмный цвет» для иконки-кружка (DESIGN.md: залитые
// чипы — только парой bg+fg).
const ICON_TONE: Record<KpiIconTone, string> = {
  primary: "bg-primary-subtle text-primary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
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

// Спарклайн (макет 2026-07-08): линия с мягкой градиентной заливкой под ней;
// money — бренд-синий, debt — оранжевый (полярность несёт дельта-чип, не линия).
function Sparkline({ points, tone }: KpiSpark) {
  const W = 76;
  const H = 32;
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
  const stroke = tone === "debt" ? "var(--stage-awaiting)" : "var(--primary)";
  const first = coords[0] ?? [pad, H / 2];
  const last = coords[coords.length - 1] ?? [W - pad, H / 2];
  // Дубликаты id при нескольких спарках одного тона безвредны: определение
  // градиента идентично, браузер берёт первое.
  const fillId = `spark-fill-${tone}`;
  const area = [
    ...coords.map(([x, y]) => `${x},${y}`),
    `${last[0]},${H - pad}`,
    `${first[0]},${H - pad}`,
  ].join(" ");
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="mb-0.5 shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${fillId})`} />
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
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
  icon: Icon,
  iconTone = "primary",
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
  icon?: LucideIcon;
  iconTone?: KpiIconTone;
  valueTone?: "default" | "debt";
  className?: string;
}) {
  const base = cn(
    "group relative block rounded-card border border-border bg-surface px-5 py-4 shadow-sm",
    "transition-[border-color,box-shadow,transform] duration-[150ms] ease-out",
    href &&
      "hover:-translate-y-px hover:border-primary-border hover:shadow-md focus-visible:-translate-y-px",
    className,
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="pt-2 text-[13px] font-medium text-text-muted">
          {label}
        </p>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              ICON_TONE[iconTone],
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="my-2 flex items-end justify-between gap-2.5">
        <p
          className={cn(
            "text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums",
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
              "inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-[12px] font-semibold",
              DELTA_TONE[delta.tone],
            )}
          >
            <DeltaMark direction={delta.direction} />
            {delta.text}
          </span>
        )}
        {context && <span className="text-[11.5px] text-text-subtle">{context}</span>}
      </div>
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
