"use client";

import * as React from "react";

import { cn, formatPercent } from "@/lib/utils";
import { type CaseCategory } from "@/lib/types/db";
import { useI18n } from "@/lib/i18n/provider";

// Бейдж категории дела. Яркая чистая гамма (см. globals.css --cat-*). Опционально
// показывает % зарплаты по категории. Вариант quiet — для плотных таблиц.

const CATEGORY_CLASS: Record<CaseCategory, string> = {
  document: "text-cat-document bg-cat-document-bg",
  claim: "text-cat-claim bg-cat-claim-bg",
  representation: "text-cat-representation bg-cat-representation-bg",
};

// Цвет точки категории (для .quiet — точка несёт семантику при тёмном тексте).
const CATEGORY_DOT: Record<CaseCategory, string> = {
  document: "bg-cat-document",
  claim: "bg-cat-claim",
  representation: "bg-cat-representation",
};

interface CategoryBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  category: CaseCategory;
  /** Если задан — показывает «· N%» (процент зарплаты по категории). */
  percent?: number;
  /** Тихий вариант для плотных таблиц: цветная точка + тёмный текст, без заливки. */
  quiet?: boolean;
}

export function CategoryBadge({
  category,
  percent,
  quiet = false,
  className,
  ...props
}: CategoryBadgeProps) {
  const { t } = useI18n();
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
          className={cn("w-[7px] h-[7px] rounded-full shrink-0", CATEGORY_DOT[category])}
        />
        {t.enums.caseCategory[category]}
        {percent != null && (
          <span className="font-mono tabular-nums text-text-subtle">
            {formatPercent(percent)}%
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "px-2.5 py-1 rounded-[7px]",
        "text-xs font-bold leading-none whitespace-nowrap",
        "before:content-[''] before:w-[7px] before:h-[7px] before:rounded-full before:bg-current before:shrink-0",
        CATEGORY_CLASS[category],
        className,
      )}
      {...props}
    >
      {t.enums.caseCategory[category]}
      {percent != null && (
        <span className="font-mono tabular-nums opacity-70">
          {formatPercent(percent)}%
        </span>
      )}
    </span>
  );
}
