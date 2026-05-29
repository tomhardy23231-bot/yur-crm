import { PieChart } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { CASE_CATEGORY_LABEL, type CaseCategory } from "@/lib/types/db";
import type { CategoryRevenueEntry } from "@/lib/dashboard/queries";

// CSS-переменная цвета категории для заливки полосы (см. globals.css --cat-*).
const CAT_VAR: Record<CaseCategory, string> = {
  document: "var(--cat-document)",
  claim: "var(--cat-claim)",
  representation: "var(--cat-representation)",
};

// Выручка (оплачено клиентами) по категориям дел. Длина полосы пропорциональна
// максимальной выручке среди категорий.
export function CategoryRevenue({
  data,
}: {
  data: ReadonlyArray<CategoryRevenueEntry>;
}) {
  const max = Math.max(1, ...data.map((d) => d.paid));
  const total = data.reduce((sum, d) => sum + d.paid, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <PieChart size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">
          Выручка по категориям
        </h2>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-text-muted">
          {formatMoney(total)} ₴
        </span>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-muted">
          Пока нет оплат — выручка появится здесь.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.map((d, i) => {
            const pct = Math.round((d.paid / max) * 100);
            return (
              <div key={d.category} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[13px] text-text">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: CAT_VAR[d.category] }}
                      aria-hidden="true"
                    />
                    {CASE_CATEGORY_LABEL[d.category]}
                    <span className="text-[12px] text-text-subtle">
                      · {d.count}
                    </span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-text">
                    {formatMoney(d.paid)} ₴
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full animate-bar-grow"
                    style={{
                      width: `${d.paid > 0 ? Math.max(pct, 4) : 0}%`,
                      background: CAT_VAR[d.category],
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
