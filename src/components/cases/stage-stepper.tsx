import { CASE_STAGES, CASE_STAGE_LABEL, type CaseStage } from "@/lib/types/db";

// CSS-переменная цвета этапа (см. globals.css --stage-*).
const STAGE_VAR: Record<CaseStage, string> = {
  new_request: "var(--stage-new)",
  consultation: "var(--stage-consultation)",
  in_progress: "var(--stage-in-progress)",
  awaiting_decision: "var(--stage-awaiting)",
  closed: "var(--stage-closed)",
};

// Степпер воронки (эталон «ЮрКейс»): 5 сегментов, окрашены до текущего этапа
// включительно; подпись текущего — жирная и цветная. Движение только вперёд.
export function StageStepper({ stage }: { stage: CaseStage }) {
  const current = CASE_STAGES.indexOf(stage);

  return (
    <div className="flex gap-1.5">
      {CASE_STAGES.map((s, i) => {
        const done = i <= current;
        const color = STAGE_VAR[s];
        return (
          <div key={s} className="flex-1 min-w-0">
            <div
              className="h-[5px] rounded-full transition-colors duration-500"
              style={{
                background: done ? color : "var(--surface-sunken)",
                transitionDelay: `${i * 80}ms`,
              }}
            />
            <div
              className="mt-1.5 truncate text-[10px] leading-tight"
              style={{
                color: done ? color : "var(--text-subtle)",
                fontWeight: i === current ? 700 : 500,
              }}
            >
              {CASE_STAGE_LABEL[s]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
