"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { type CaseStage } from "@/lib/types/db";
import { useI18n } from "@/lib/i18n/provider";
import type { FunnelEntry } from "@/lib/dashboard/queries";

// CSS-переменная цвета этапа для заливки полосы (см. globals.css --stage-*).
const STAGE_VAR: Record<CaseStage, string> = {
  new_request: "var(--stage-new)",
  consultation: "var(--stage-consultation)",
  in_progress: "var(--stage-in-progress)",
  awaiting_decision: "var(--stage-awaiting)",
  closed: "var(--stage-closed)",
};

// Воронка дел по 5 этапам (рестайл по макету владельца 2026-07-08: точка +
// название + число сверху, полоса на всю ширину снизу — компактно в узкой
// колонке). Каждая строка кликабельна → дела этого этапа (бриф §3.2).
export function StageFunnel({ funnel }: { funnel: ReadonlyArray<FunnelEntry> }) {
  const { t } = useI18n();
  const max = Math.max(1, ...funnel.map((f) => f.count));
  const total = funnel.reduce((sum, f) => sum + f.count, 0);

  return (
    <Card className="p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-text">
          {t.dashboard.funnel.title}
        </h2>
        <span className="ml-auto text-[12px] tabular-nums text-text-muted">
          {total}
        </span>
      </div>

      <div className="flex flex-col">
        {funnel.map((f, i) => {
          const pct = Math.round((f.count / max) * 100);
          return (
            <Link
              key={f.stage}
              href={`/cases?stage=${f.stage}`}
              className="-mx-2.5 flex flex-col gap-1.5 rounded-md px-2.5 py-2 transition-colors hover:bg-primary-softer"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: STAGE_VAR[f.stage] }}
                />
                <span className="min-w-0 truncate text-[13px] text-text">
                  {t.enums.caseStage[f.stage]}
                </span>
                <span
                  className={`ml-auto shrink-0 text-[13px] font-semibold tabular-nums ${
                    f.count > 0 ? "text-text" : "text-text-subtle"
                  }`}
                >
                  {f.count}
                </span>
              </span>
              <span className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full animate-bar-grow"
                  style={{
                    width: `${f.count > 0 ? Math.max(pct, 4) : 0}%`,
                    background: STAGE_VAR[f.stage],
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
