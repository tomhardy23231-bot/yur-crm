'use client';

import { useOptimistic, useTransition } from 'react';

import { cn } from '@/lib/utils';
import { updateCaseStageAction } from '@/lib/cases/actions';
import { CASE_STAGES, CASE_STAGE_LABEL, type CaseStage } from '@/lib/types/db';

// CSS-переменная цвета этапа (см. globals.css --stage-*).
const STAGE_VAR: Record<CaseStage, string> = {
  new_request: 'var(--stage-new)',
  consultation: 'var(--stage-consultation)',
  in_progress: 'var(--stage-in-progress)',
  awaiting_decision: 'var(--stage-awaiting)',
  closed: 'var(--stage-closed)',
};

interface CaseStageStepperProps {
  caseId: string;
  stage: CaseStage;
  /** Этапы, на которые можно перейти (staff — все 5; иначе текущий + вперёд). */
  allowedStages: readonly CaseStage[];
  /** Загружен ли акт приёма-передачи. Если нет — спрашиваем подтверждение при
   *  переводе дела в «Завершено» (мягкий контроль, Задача 4). */
  hasAct?: boolean;
}

// Кликабельный степпер воронки. Сегменты до текущего этапа залиты цветом;
// наведение на доступный этап заливает его сегмент (анимация из CRMVADIM,
// адаптированная под горизонталь — заполнение слева направо). Клик меняет
// этап оптимистично: UI обновляется мгновенно и из одного источника, без
// рассинхрона. Правило «только вперёд» и лог отката держит БД-триггер.
export function CaseStageStepper({
  caseId,
  stage,
  allowedStages,
  hasAct = true,
}: CaseStageStepperProps) {
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage);
  const [pending, startTransition] = useTransition();

  const current = CASE_STAGES.indexOf(optimisticStage);
  const allowed = new Set(allowedStages);

  const handleSelect = (s: CaseStage) => {
    if (s === optimisticStage || !allowed.has(s) || pending) return;
    // Мягкий контроль (Задача 4): завершить без акта можно, но с подтверждением.
    if (s === 'closed' && !hasAct) {
      const okToClose = window.confirm(
        'По делу не загружен акт приёма-передачи выполненных работ. Завершить дело всё равно?',
      );
      if (!okToClose) return;
    }
    startTransition(async () => {
      setOptimisticStage(s);
      const fd = new FormData();
      fd.set('stage', s);
      await updateCaseStageAction(caseId, { ok: true }, fd);
    });
  };

  return (
    <div className="flex gap-1.5">
      {CASE_STAGES.map((s, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        const color = STAGE_VAR[s];
        const selectable = allowed.has(s) && !pending;

        return (
          <button
            key={s}
            type="button"
            disabled={!selectable}
            onClick={() => handleSelect(s)}
            aria-current={isCurrent ? 'step' : undefined}
            title={
              selectable
                ? `Перевести на этап «${CASE_STAGE_LABEL[s]}»`
                : CASE_STAGE_LABEL[s]
            }
            className={cn(
              'group relative -mx-1 min-w-0 flex-1 rounded-md px-1 pb-1 pt-1 text-left',
              'transition-colors duration-200',
              selectable
                ? 'cursor-pointer hover:bg-primary-subtle/40'
                : 'cursor-default',
            )}
          >
            {/* Дорожка сегмента + заливка */}
            <div
              className="relative h-[5px] overflow-hidden rounded-full"
              style={{ background: 'var(--surface-sunken)' }}
            >
              {/* Committed-заливка: цвет до текущего этапа включительно. */}
              <div
                className="absolute inset-0 rounded-full transition-[clip-path] duration-500 ease-out"
                style={{
                  background: color,
                  clipPath: done ? 'inset(0)' : 'inset(0 100% 0 0)',
                  transitionDelay: `${i * 60}ms`,
                }}
              />
              {/* Hover-превью: заливается слева направо при наведении на ещё
                  не пройденный доступный этап. */}
              {selectable && !done && (
                <div
                  className="absolute inset-0 rounded-full opacity-55 [clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-300 ease-out group-hover:[clip-path:inset(0)]"
                  style={{ background: color }}
                />
              )}
            </div>
            <div
              className="mt-1.5 truncate text-[10px] leading-tight transition-colors duration-200"
              style={{
                color: done ? color : 'var(--text-subtle)',
                fontWeight: isCurrent ? 700 : 500,
              }}
            >
              {CASE_STAGE_LABEL[s]}
            </div>
          </button>
        );
      })}
    </div>
  );
}
