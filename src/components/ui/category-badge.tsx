import * as React from "react";

import { cn, formatPercent } from "@/lib/utils";
import { CASE_CATEGORY_LABEL, type CaseCategory } from "@/lib/types/db";

// Бейдж категории дела. Тёплая/глубокая гамма (см. globals.css --cat-*),
// форма-чип со скруглённым КВАДРАТНЫМ маркером — намеренно отличается от
// этап-пилюль (круглый dot, rounded-full), чтобы в соседних колонках таблицы
// их нельзя было перепутать. Опционально показывает % зарплаты по категории.

const CATEGORY_CLASS: Record<CaseCategory, string> = {
  document: "text-cat-document bg-cat-document-bg",
  claim: "text-cat-claim bg-cat-claim-bg",
  representation: "text-cat-representation bg-cat-representation-bg",
};

interface CategoryBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  category: CaseCategory;
  /** Если задан — показывает «· N%» (процент зарплаты по категории). */
  percent?: number;
}

export function CategoryBadge({
  category,
  percent,
  className,
  ...props
}: CategoryBadgeProps) {
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
      {CASE_CATEGORY_LABEL[category]}
      {percent != null && (
        <span className="font-mono tabular-nums opacity-70">
          {formatPercent(percent)}%
        </span>
      )}
    </span>
  );
}
