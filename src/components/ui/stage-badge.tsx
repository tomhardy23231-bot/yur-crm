import * as React from "react";

import { cn } from "@/lib/utils";

export type Stage =
  | "new_request"
  | "consultation"
  | "in_progress"
  | "pretrial"
  | "litigation"
  | "awaiting_decision"
  | "enforcement"
  | "closed";

export const STAGE_LABELS: Record<Stage, string> = {
  new_request: "Новое обращение",
  consultation: "Консультация",
  in_progress: "В работе",
  pretrial: "Досудебное",
  litigation: "Судебное",
  awaiting_decision: "Ожидание решения",
  enforcement: "Исполнение",
  closed: "Завершено",
};

const STAGE_CLASS: Record<Stage, string> = {
  new_request:       "text-stage-new bg-stage-new-bg",
  consultation:      "text-stage-consultation bg-stage-consultation-bg",
  in_progress:       "text-stage-in-progress bg-stage-in-progress-bg",
  pretrial:          "text-stage-pretrial bg-stage-pretrial-bg",
  litigation:        "text-stage-litigation bg-stage-litigation-bg",
  awaiting_decision: "text-stage-awaiting bg-stage-awaiting-bg",
  enforcement:       "text-stage-enforcement bg-stage-enforcement-bg",
  closed:            "text-stage-closed bg-stage-closed-bg",
};

interface StageBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  stage: Stage;
  label?: string;
}

export function StageBadge({ stage, label, className, ...props }: StageBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "px-2.5 py-0.5 rounded-full",
        "text-xs font-semibold leading-tight",
        "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:shrink-0",
        STAGE_CLASS[stage],
        className,
      )}
      {...props}
    >
      {label ?? STAGE_LABELS[stage]}
    </span>
  );
}
