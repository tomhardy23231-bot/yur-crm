import { cn } from "@/lib/utils";
import { CASE_STAGES, CASE_STAGE_LABEL, type CaseStage } from "@/lib/types/db";

// CSS-переменная цвета этапа (см. globals.css --stage-*).
const STAGE_VAR: Record<CaseStage, string> = {
  new_request: "var(--stage-new)",
  consultation: "var(--stage-consultation)",
  in_progress: "var(--stage-in-progress)",
  awaiting_decision: "var(--stage-awaiting)",
  closed: "var(--stage-closed)",
};

const ARROW = "11px";

function arrowClip(i: number, last: number): string {
  if (i === 0) {
    return `polygon(0 0, calc(100% - ${ARROW}) 0, 100% 50%, calc(100% - ${ARROW}) 100%, 0 100%)`;
  }
  if (i === last) {
    return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${ARROW} 50%)`;
  }
  return `polygon(0 0, calc(100% - ${ARROW}) 0, 100% 50%, calc(100% - ${ARROW}) 100%, 0 100%, ${ARROW} 50%)`;
}

// Степпер-воронка (read-only, для тех, кто не может менять этап): сегменты-стрелки
// залиты цветом этапа до текущего включительно; будущие — нейтральный фон.
// Подписи — под стрелками. Движение только вперёд.
export function StageStepper({ stage }: { stage: CaseStage }) {
  const current = CASE_STAGES.indexOf(stage);
  const last = CASE_STAGES.length - 1;

  return (
    <div className="flex items-stretch gap-1">
      {CASE_STAGES.map((s, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        const color = STAGE_VAR[s];

        return (
          <div key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              style={{
                clipPath: arrowClip(i, last),
                background: done ? color : "var(--surface-sunken)",
              }}
              className={cn("block h-6 w-full", isCurrent && "shadow-sm")}
            />
            <span
              className="px-1 text-center text-[11px] leading-tight"
              style={{
                color: done ? color : "var(--text-subtle)",
                fontWeight: isCurrent ? 700 : 500,
              }}
            >
              {CASE_STAGE_LABEL[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
