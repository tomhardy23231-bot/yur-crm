'use client';

import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { CASE_STAGES, type CaseStage } from '@/lib/types/db';

// Цвет каждого этапа (тот же, что у точек в списках). Читаем из токенов —
// тема (латунь/teal) подхватывается автоматически.
const STAGE_FG: Record<CaseStage, string> = {
  new_request: 'var(--stage-new)',
  consultation: 'var(--stage-consultation)',
  in_progress: 'var(--stage-in-progress)',
  awaiting_decision: 'var(--stage-awaiting)',
  closed: 'var(--stage-closed)',
};
const STAGE_BG: Record<CaseStage, string> = {
  new_request: 'var(--stage-new-bg)',
  consultation: 'var(--stage-consultation-bg)',
  in_progress: 'var(--stage-in-progress-bg)',
  awaiting_decision: 'var(--stage-awaiting-bg)',
  closed: 'var(--stage-closed-bg)',
};

type StageState = 'done' | 'current' | 'future';

export interface StageCapsulesProps {
  /** Текущий (возможно оптимистичный) этап. */
  stage: CaseStage;
  /** Задан → капсулы кликабельны (staff/редактор); иначе read-only. */
  allowedStages?: readonly CaseStage[];
  pending?: boolean;
  onSelect?: (s: CaseStage) => void;
  /** Подпись-подсказка для доступного к переходу этапа. */
  selectableTitle?: (s: CaseStage) => string;
}

// Воронка этапов «капсулами»: пройденные — мягкая заливка цветом этапа + галочка,
// текущий — насыщенная капсула своего цвета со свечением и пульс-точкой, будущие —
// приглушённые с номером. Движение только вперёд (CLAUDE.md §6).
export function StageCapsules({
  stage,
  allowedStages,
  pending = false,
  onSelect,
  selectableTitle,
}: StageCapsulesProps) {
  const { t } = useI18n();
  const current = CASE_STAGES.indexOf(stage);
  const interactive = !!onSelect;
  const allowed = new Set(allowedStages ?? []);

  return (
    <ol className="flex items-stretch gap-1.5">
      {CASE_STAGES.map((s, i) => {
        const state: StageState =
          i < current ? 'done' : i === current ? 'current' : 'future';
        const fg = STAGE_FG[s];
        const bg = STAGE_BG[s];
        const label = t.enums.caseStage[s];
        const selectable =
          interactive && allowed.has(s) && !pending && state !== 'current';

        // Стиль капсулы по состоянию. Кольцо красим через --tw-ring-color, чтобы
        // оно следовало цвету этапа; фон/текст — прямой заливкой токеном.
        const style = {} as CSSProperties & Record<string, string>;
        if (state === 'current') {
          style.background = fg;
          style.color = '#fff';
          style.boxShadow = `0 8px 20px -6px color-mix(in oklab, ${fg} 60%, transparent)`;
        } else if (state === 'done') {
          style.background = bg;
          style.color = fg;
          style['--tw-ring-color'] = `color-mix(in oklab, ${fg} 30%, transparent)`;
        } else {
          // future
          style.background = 'var(--surface-sunken)';
          style.color = selectable ? fg : 'var(--text-subtle)';
          style['--tw-ring-color'] = selectable
            ? `color-mix(in oklab, ${fg} 32%, transparent)`
            : 'var(--border)';
        }

        const node =
          state === 'done' ? (
            <Check size={13} strokeWidth={2.75} />
          ) : state === 'current' ? (
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
          ) : (
            <span className="text-[10px] font-bold tabular-nums">{i + 1}</span>
          );

        const className = cn(
          'relative flex w-full min-w-0 items-center justify-center gap-1.5',
          'rounded-full px-2.5 py-2 text-[11.5px] font-semibold leading-none',
          'transition-[transform,box-shadow,background,color] duration-200 ease-out',
          (state === 'done' || state === 'future') && 'ring-1 ring-inset',
          state === 'current' && 'z-10 scale-[1.04]',
          selectable &&
            'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm hover:ring-2',
          interactive &&
            !selectable &&
            state !== 'current' &&
            'cursor-default',
          interactive &&
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        );

        const inner = (
          <>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {node}
            </span>
            <span className="truncate">{label}</span>
          </>
        );

        return (
          <li key={s} className="min-w-0 flex-1">
            {interactive ? (
              <button
                type="button"
                disabled={!selectable}
                onClick={() => selectable && onSelect?.(s)}
                aria-current={state === 'current' ? 'step' : undefined}
                title={
                  selectable && selectableTitle ? selectableTitle(s) : label
                }
                style={style}
                className={className}
              >
                {inner}
              </button>
            ) : (
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                title={label}
                style={style}
                className={className}
              >
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
