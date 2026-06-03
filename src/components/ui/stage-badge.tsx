import * as React from "react";

import { cn } from "@/lib/utils";

export type Stage =
  | "new_request"
  | "consultation"
  | "in_progress"
  | "awaiting_decision"
  | "closed";

export const STAGE_LABELS: Record<Stage, string> = {
  new_request: "Новое обращение",
  consultation: "Консультация",
  in_progress: "В работе",
  awaiting_decision: "Ожидание решения",
  closed: "Завершено",
};

const STAGE_CLASS: Record<Stage, string> = {
  new_request:       "text-stage-new bg-stage-new-bg",
  consultation:      "text-stage-consultation bg-stage-consultation-bg",
  in_progress:       "text-stage-in-progress bg-stage-in-progress-bg",
  awaiting_decision: "text-stage-awaiting bg-stage-awaiting-bg",
  closed:            "text-stage-closed bg-stage-closed-bg",
};

// Цвет точки этапа (для .quiet — точка несёт семантику при тёмном тексте).
const STAGE_DOT: Record<Stage, string> = {
  new_request:       "bg-stage-new",
  consultation:      "bg-stage-consultation",
  in_progress:       "bg-stage-in-progress",
  awaiting_decision: "bg-stage-awaiting",
  closed:            "bg-stage-closed",
};

interface StageBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  stage: Stage;
  label?: string;
  /** Тихий вариант для плотных таблиц: цветная точка + тёмный текст, без заливки. */
  quiet?: boolean;
}

export function StageBadge({ stage, label, quiet = false, className, ...props }: StageBadgeProps) {
  // «Живой» этап (не завершён) — точка пульсирует. Завершённый — статичная.
  const live = stage !== "closed";

  // .quiet (бриф §3.4) — для плотных таблиц: статичная цветная точка + тёмный
  // текст, без заливки/кольца/пульса, чтобы строки не шумели.
  if (quiet) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          "text-xs font-semibold leading-none whitespace-nowrap text-text",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn("w-[7px] h-[7px] rounded-full shrink-0", STAGE_DOT[stage])}
        />
        {label ?? STAGE_LABELS[stage]}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "px-2.5 py-1 rounded-[7px]",
        "text-xs font-bold leading-none whitespace-nowrap",
        "ring-1 ring-inset ring-current/20",
        STAGE_CLASS[stage],
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "w-[7px] h-[7px] rounded-full bg-current shrink-0",
          live && "stage-dot-live",
        )}
      />
      {label ?? STAGE_LABELS[stage]}
    </span>
  );
}
