import { cn } from "@/lib/utils";
import { CASE_STAGES, CASE_STAGE_LABEL, type CaseStage } from "@/lib/types/db";

// Синяя «лента» прогресса этапов (бриф §7): текущий этап — синий, пройденные —
// серые, будущие — бледные. Единый акцент вместо разноцветной шкалы.
const PASSED = "var(--border-strong)";
const CURRENT = "var(--primary)";
const FUTURE = "var(--surface-sunken)";

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

// Степпер-воронка (read-only): сегменты-стрелки. Движение только вперёд.
export function StageStepper({ stage }: { stage: CaseStage }) {
  const current = CASE_STAGES.indexOf(stage);
  const last = CASE_STAGES.length - 1;

  return (
    <div className="flex items-stretch gap-1">
      {CASE_STAGES.map((s, i) => {
        const isCurrent = i === current;
        const fill = i < current ? PASSED : isCurrent ? CURRENT : FUTURE;
        const labelColor =
          i < current
            ? "var(--text-muted)"
            : isCurrent
              ? "var(--primary)"
              : "var(--text-subtle)";

        return (
          <div key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              style={{ clipPath: arrowClip(i, last), background: fill }}
              className={cn("block h-6 w-full", isCurrent && "shadow-sm")}
            />
            <span
              className="px-1 text-center text-[11px] leading-tight"
              style={{ color: labelColor, fontWeight: isCurrent ? 700 : 500 }}
            >
              {CASE_STAGE_LABEL[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
