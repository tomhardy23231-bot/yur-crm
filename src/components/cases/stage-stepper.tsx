"use client";

import { StageCapsules } from "@/components/cases/stage-capsules";
import { type CaseStage } from "@/lib/types/db";

// Воронка этапов (read-only) — капсулы с цветом каждого этапа.
// Движение только вперёд (CLAUDE.md §6).
export function StageStepper({ stage }: { stage: CaseStage }) {
  return <StageCapsules stage={stage} />;
}
