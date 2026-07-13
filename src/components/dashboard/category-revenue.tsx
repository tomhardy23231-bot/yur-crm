"use client";

import Link from "next/link";
import { PieChart } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/utils";
import { type CaseCategory } from "@/lib/types/db";
import { useI18n } from "@/lib/i18n/provider";
import type { CategoryRevenueEntry } from "@/lib/dashboard/queries";

// CSS-переменная цвета категории для заливки полосы (см. globals.css --cat-*).
const CAT_VAR: Record<CaseCategory, string> = {
  document: "var(--cat-document)",
  claim: "var(--cat-claim)",
  representation: "var(--cat-representation)",
};

// Выручка (оплачено клиентами) по категориям дел. Каждая строка кликабельна →
// дела этой категории (бриф §3.2).
export function CategoryRevenue({
  data,
}: {
  data: ReadonlyArray<CategoryRevenueEntry>;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.paid));
  const total = data.reduce((sum, d) => sum + d.paid, 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-text">
          {t.dashboard.categoryRevenue.title}
        </h2>
        <span className="ml-auto text-[12px] tabular-nums text-text-muted">
          {formatMoney(total)} ₴
        </span>
      </div>

      {total === 0 ? (
        <EmptyState size="sm" icon={PieChart} title={t.dashboard.categoryRevenue.empty} />
      ) : (
        <div className="flex flex-col">
          {data.map((d, i) => {
            const pct = Math.round((d.paid / max) * 100);
            return (
              <Link
                key={d.category}
                href={`/cases?category=${d.category}`}
                className="-mx-2.5 flex flex-col gap-1.5 rounded-md px-2.5 py-2 transition-colors hover:bg-primary-softer"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[13px] text-text">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: CAT_VAR[d.category] }}
                      aria-hidden="true"
                    />
                    {t.enums.caseCategory[d.category]}
                    <span className="text-[12px] text-text-subtle">· {d.count}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-text">
                    {formatMoney(d.paid)} ₴
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full animate-bar-grow"
                    style={{
                      width: `${d.paid > 0 ? Math.max(pct, 4) : 0}%`,
                      background: CAT_VAR[d.category],
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
