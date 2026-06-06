'use client';

import { useOptimistic, useTransition } from 'react';

import { StageCapsules } from '@/components/cases/stage-capsules';
import { updateCaseStageAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';
import { type CaseStage } from '@/lib/types/db';

interface CaseStageStepperProps {
  caseId: string;
  stage: CaseStage;
  /** Этапы, на которые можно перейти (staff — все 5; иначе текущий + вперёд). */
  allowedStages: readonly CaseStage[];
  /** Загружен ли акт приёма-передачи. Если нет — спрашиваем подтверждение при
   *  переводе дела в «Завершено» (мягкий контроль). */
  hasAct?: boolean;
}

// Кликабельная воронка-капсулы. Клик меняет этап оптимистично (мгновенный UI).
// Правило «только вперёд» и лог отката держит БД-триггер. Рендер — общий
// StageCapsules (тот же вид, что и в read-only варианте).
export function CaseStageStepper({
  caseId,
  stage,
  allowedStages,
  hasAct = true,
}: CaseStageStepperProps) {
  const { t, fmt } = useI18n();
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage);
  const [pending, startTransition] = useTransition();

  const handleSelect = (s: CaseStage) => {
    if (s === optimisticStage || pending) return;
    // Мягкий контроль: завершить без акта можно, но с подтверждением.
    if (s === 'closed' && !hasAct) {
      const okToClose = window.confirm(
        t.caseCard.stepper.confirmCloseWithoutAct,
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

  // Текущий этап в кликабельную выборку не отдаём (это «вы здесь»).
  const selectable = allowedStages.filter((s) => s !== optimisticStage);

  return (
    <StageCapsules
      stage={optimisticStage}
      allowedStages={selectable}
      pending={pending}
      onSelect={handleSelect}
      selectableTitle={(s) =>
        fmt(t.caseCard.stepper.moveTo, { stage: t.enums.caseStage[s] })
      }
    />
  );
}
