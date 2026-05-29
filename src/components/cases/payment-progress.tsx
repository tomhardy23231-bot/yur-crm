import { cn, formatMoney } from "@/lib/utils";

// Прогресс оплаты по делу: зелёная полоса = деньги (DESIGN.md семантика).
// paid/total → процент. Используется в списке дел, последних делах и карточке.
export function PaymentProgress({
  paid,
  total,
  showLabel = false,
  className,
}: {
  paid: number;
  total: number;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const full = pct >= 100;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {showLabel && (
        <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums text-[11px]">
          <span className="font-medium text-text">{formatMoney(paid)} ₴</span>
          <span className={full ? "text-success" : "text-text-subtle"}>
            {pct}%
          </span>
        </div>
      )}
      <div
        className="h-[7px] w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Оплачено по делу"
      >
        {/* Латунь при частичной оплате, зелёный «деньги» при 100% (эталон). */}
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: full ? "var(--success)" : "var(--grad-brass)",
          }}
        />
      </div>
    </div>
  );
}
