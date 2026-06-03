'use client';

import { useOptimistic, useTransition } from 'react';

import { cn } from '@/lib/utils';
import { updateCaseStageAction } from '@/lib/cases/actions';
import { CASE_STAGES, CASE_STAGE_LABEL, type CaseStage } from '@/lib/types/db';

// Синяя «лента» прогресса (бриф §7): текущий — синий, пройденные — серые,
// будущие — бледные; превью при наведении на доступный этап — синее.
const PASSED = 'var(--border-strong)';
const CURRENT = 'var(--primary)';
const FUTURE = 'var(--surface-sunken)';

// Глубина «носа»/выемки стрелки (px). Воронка-стрелки: сегменты-шевроны встык,
// каждый указывает на следующий этап — визуально читается как воронка дела.
const ARROW = '11px';

// clip-path сегмента в зависимости от позиции: первый — плоский слева, нос
// справа; последний — выемка слева, плоский справа; средние — выемка + нос.
function arrowClip(i: number, last: number): string {
  if (i === 0) {
    return `polygon(0 0, calc(100% - ${ARROW}) 0, 100% 50%, calc(100% - ${ARROW}) 100%, 0 100%)`;
  }
  if (i === last) {
    return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${ARROW} 50%)`;
  }
  return `polygon(0 0, calc(100% - ${ARROW}) 0, 100% 50%, calc(100% - ${ARROW}) 100%, 0 100%, ${ARROW} 50%)`;
}

interface CaseStageStepperProps {
  caseId: string;
  stage: CaseStage;
  /** Этапы, на которые можно перейти (staff — все 5; иначе текущий + вперёд). */
  allowedStages: readonly CaseStage[];
  /** Загружен ли акт приёма-передачи. Если нет — спрашиваем подтверждение при
   *  переводе дела в «Завершено» (мягкий контроль). */
  hasAct?: boolean;
}

// Кликабельный степпер-воронка. Сегменты до текущего этапа включительно залиты
// цветом своего этапа; будущие — нейтральный фон. Наведение на доступный этап
// заливает его сегмент цветом-превью. Клик меняет этап оптимистично (мгновенный
// UI из одного источника). Правило «только вперёд» и лог отката держит БД-триггер.
export function CaseStageStepper({
  caseId,
  stage,
  allowedStages,
  hasAct = true,
}: CaseStageStepperProps) {
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage);
  const [pending, startTransition] = useTransition();

  const current = CASE_STAGES.indexOf(optimisticStage);
  const last = CASE_STAGES.length - 1;
  const allowed = new Set(allowedStages);

  const handleSelect = (s: CaseStage) => {
    if (s === optimisticStage || !allowed.has(s) || pending) return;
    // Мягкий контроль: завершить без акта можно, но с подтверждением.
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
    <div className="flex items-stretch gap-1">
      {CASE_STAGES.map((s, i) => {
        const isCurrent = i === current;
        const fill = i < current ? PASSED : isCurrent ? CURRENT : FUTURE;
        const labelColor =
          i < current
            ? 'var(--text-muted)'
            : isCurrent
              ? 'var(--primary)'
              : 'var(--text-subtle)';
        const selectable = allowed.has(s) && !pending && !isCurrent;

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
              'group flex min-w-0 flex-1 flex-col gap-1 rounded-sm text-left',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              selectable ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            {/* Сегмент-стрелка. Фон через CSS-переменные, чтобы ховер-превью
                (класс) мог перекрыть committed-фон (тоже класс). */}
            <span
              style={
                {
                  clipPath: arrowClip(i, last),
                  '--seg': CURRENT,
                  '--seg-bg': fill,
                } as React.CSSProperties
              }
              className={cn(
                'block h-6 w-full [background:var(--seg-bg)]',
                'transition-[background,box-shadow,filter] duration-200',
                isCurrent && 'shadow-sm',
                selectable &&
                  'group-hover:[background:var(--seg)] group-hover:shadow-sm',
              )}
            />
            {/* Подпись под стрелкой. */}
            <span
              className="px-1 text-center text-[11px] leading-tight transition-colors"
              style={{
                color: labelColor,
                fontWeight: isCurrent ? 700 : 500,
              }}
            >
              {CASE_STAGE_LABEL[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
