'use client';

import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react';

import { updateCaseStageAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';
import { CASE_STAGES, type CaseStage } from '@/lib/types/db';
import { cn } from '@/lib/utils';

// Цвет каждого этапа из токенов — тема (латунь/teal) подхватывается сама.
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

interface CaseStageDropdownProps {
  caseId: string;
  stage: CaseStage;
  /** Этапы, на которые можно перейти (staff — все 5; иначе текущий + следующий). */
  allowedStages: readonly CaseStage[];
  /** Загружен ли акт приёма-передачи. Нет → confirm при переводе в «Завершено». */
  hasAct?: boolean;
  /** Есть ли право менять этап. Нет → статичная пилюля без меню. */
  canEdit?: boolean;
}

// Этап дела как кликабельная «пилюля» с выпадающим списком этапов.
// Триггер — пилюля цвета текущего этапа; меню — вертикальные мини-капсулы
// (пройденные с галочкой, текущий насыщенный, будущие с номером; недоступные
// для перехода — приглушены). Правило «только вперёд» держит БД-триггер;
// allowedStages — UX-фильтр (CLAUDE.md §6, §7-2).
export function CaseStageDropdown({
  caseId,
  stage,
  allowedStages,
  hasAct = true,
  canEdit = false,
}: CaseStageDropdownProps) {
  const { t, fmt } = useI18n();
  const [optimisticStage, setOptimisticStage] = useOptimistic(stage);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Закрытие по клику вне и по Escape (фокус возвращаем на триггер).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = (s: CaseStage) => {
    setOpen(false);
    if (s === optimisticStage || pending) return;
    // Мягкий контроль: завершить без акта можно, но с подтверждением.
    if (s === 'closed' && !hasAct) {
      const okToClose = window.confirm(t.caseCard.stepper.confirmCloseWithoutAct);
      if (!okToClose) return;
    }
    startTransition(async () => {
      setOptimisticStage(s);
      const fd = new FormData();
      fd.set('stage', s);
      await updateCaseStageAction(caseId, { ok: true }, fd);
    });
  };

  const fg = STAGE_FG[optimisticStage];
  const live = optimisticStage !== 'closed';

  // ── Read-only: статичная пилюля цвета этапа, без стрелки/меню. ──
  if (!canEdit) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold leading-none text-white shadow-sm"
        style={{
          background: fg,
          boxShadow: `0 6px 16px -8px color-mix(in oklab, ${fg} 60%, transparent)`,
        }}
      >
        <StageDot live={live} />
        {t.enums.caseStage[optimisticStage]}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t.caseCard.stepper.changeStage}
        style={{
          background: fg,
          boxShadow: `0 6px 16px -8px color-mix(in oklab, ${fg} 60%, transparent)`,
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
          'text-[12px] font-bold leading-none text-white shadow-sm',
          'transition-[transform,box-shadow,opacity] duration-200 ease-out',
          'hover:-translate-y-0.5 hover:shadow-md',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
          pending && 'cursor-wait opacity-70',
        )}
      >
        <StageDot live={live} />
        <span>{t.enums.caseStage[optimisticStage]}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.25}
          aria-hidden="true"
          className={cn(
            'transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul
          id={menuId}
          role="listbox"
          aria-label={t.caseCard.stepper.menuLabel}
          className={cn(
            'absolute left-0 top-[calc(100%+6px)] z-30 w-[min(15rem,80vw)]',
            'flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5',
            'shadow-lg shadow-black/10',
            'origin-top animate-[stage-menu-in_140ms_ease-out]',
          )}
        >
          {CASE_STAGES.map((s, i) => {
            const current = CASE_STAGES.indexOf(optimisticStage);
            const state =
              i < current ? 'done' : i === current ? 'current' : 'future';
            const selectable =
              allowedStages.includes(s) && state !== 'current';
            const sFg = STAGE_FG[s];
            const sBg = STAGE_BG[s];

            // Стиль мини-капсулы по состоянию (как в прежнем степпере).
            const style = {} as CSSProperties & Record<string, string>;
            if (state === 'current') {
              style.background = sFg;
              style.color = '#fff';
            } else if (state === 'done') {
              style.background = sBg;
              style.color = sFg;
            } else {
              style.background = 'var(--surface-sunken)';
              style.color = selectable ? sFg : 'var(--text-subtle)';
            }

            return (
              <li key={s} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={state === 'current'}
                  disabled={!selectable}
                  onClick={() => selectable && handleSelect(s)}
                  title={
                    selectable
                      ? fmt(t.caseCard.stepper.moveTo, {
                          stage: t.enums.caseStage[s],
                        })
                      : t.enums.caseStage[s]
                  }
                  style={style}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-full px-3 py-2',
                    'text-[12.5px] font-semibold leading-none',
                    'transition-[transform,box-shadow,opacity] duration-150 ease-out',
                    selectable &&
                      'cursor-pointer hover:scale-[1.015] hover:shadow-sm',
                    !selectable && state !== 'current' && 'cursor-default opacity-70',
                    state === 'current' && 'cursor-default',
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {state === 'done' ? (
                      <Check size={13} strokeWidth={2.75} />
                    ) : state === 'current' ? (
                      <StageDot live={live} />
                    ) : (
                      <span className="text-[10px] font-bold tabular-nums">
                        {i + 1}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 text-left">{t.enums.caseStage[s]}</span>
                  {state === 'current' && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-white/75">
                      {t.caseCard.stepper.youAreHere}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Пульсирующая точка для «живого» этапа (статичная — для закрытого).
function StageDot({ live }: { live: boolean }) {
  if (!live) {
    return <span className="inline-flex h-2 w-2 rounded-full bg-current" />;
  }
  return (
    <span className="relative flex h-2 w-2 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
    </span>
  );
}
