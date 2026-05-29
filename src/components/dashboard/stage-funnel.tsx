import { Filter } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CASE_STAGE_LABEL, type CaseStage } from "@/lib/types/db";
import type { FunnelEntry } from "@/lib/dashboard/queries";

// CSS-переменная цвета этапа для заливки полосы (см. globals.css --stage-*).
const STAGE_VAR: Record<CaseStage, string> = {
  new_request: "var(--stage-new)",
  consultation: "var(--stage-consultation)",
  in_progress: "var(--stage-in-progress)",
  awaiting_decision: "var(--stage-awaiting)",
  closed: "var(--stage-closed)",
};

// Воронка дел по 5 этапам: длина полосы пропорциональна максимуму в воронке.
export function StageFunnel({ funnel }: { funnel: ReadonlyArray<FunnelEntry> }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  const total = funnel.reduce((sum, f) => sum + f.count, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Filter size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[15px] font-semibold text-text">Воронка дел</h2>
        <span className="ml-auto font-mono text-[12px] tabular-nums text-text-muted">
          {total}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {funnel.map((f, i) => {
          const pct = Math.round((f.count / max) * 100);
          return (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-[13px] text-text">
                {CASE_STAGE_LABEL[f.stage]}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full animate-bar-grow"
                  style={{
                    width: `${f.count > 0 ? Math.max(pct, 4) : 0}%`,
                    background: STAGE_VAR[f.stage],
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span className="w-7 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-text">
                {f.count}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
