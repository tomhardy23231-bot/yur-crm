"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

export type Stage =
  | "new_request"
  | "consultation"
  | "in_progress"
  | "awaiting_decision"
  | "closed";

// Подписи этапов берутся из словаря (t.enums.caseStage).
// Текст залитого чипа — тёмный *-fg (WCAG AA на своей подложке, v3 s10);
// яркий тон этапа остаётся в точке (.quiet) и заливках.
const STAGE_CLASS: Record<Stage, string> = {
  new_request:       "text-stage-new-fg bg-stage-new-bg",
  consultation:      "text-stage-consultation-fg bg-stage-consultation-bg",
  in_progress:       "text-stage-in-progress-fg bg-stage-in-progress-bg",
  awaiting_decision: "text-stage-awaiting-fg bg-stage-awaiting-bg",
  closed:            "text-stage-closed-fg bg-stage-closed-bg",
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
  /** Пульсация точки активного этапа. Выключаем в длинных списках (десятки строк
      с бесконечной анимацией дёргают скролл). По умолчанию включена. */
  pulse?: boolean;
}

export function StageBadge({ stage, label, quiet = false, pulse = true, className, ...props }: StageBadgeProps) {
  const { t } = useI18n();
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
        {label ?? t.enums.caseStage[stage]}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "px-2.5 py-1 rounded-chip",
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
          live && pulse && "stage-dot-live",
        )}
      />
      {label ?? t.enums.caseStage[stage]}
    </span>
  );
}
