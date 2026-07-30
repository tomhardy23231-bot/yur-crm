'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardList,
  Info,
  Lock,
  RefreshCw,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type {
  AccountingSetupState,
  SetupStep,
  SetupStepId,
} from '@/lib/onboarding/setup-state';

// Мастер настройки учёта (2026-07-30). Полноэкранное окно с чеклистом трёх
// ручных шагов книги операций. Показ держит OnboardingProvider (вход + раз в
// 4 часа); состояние шагов считается по данным, поэтому окно исчезает само,
// как только владелец доводит настройку до конца.
//
// Закрытие не блокируется (решение владельца): настойчивость обеспечивают
// повторный показ и постоянная плашка под топбаром, а не запертая кнопка.

const STEP_ICONS: Record<SetupStepId, typeof Wallet> = {
  accounts: Wallet,
  sync: RefreshCw,
  cleanup: ClipboardList,
};

// Компонент монтируется ТОЛЬКО на время показа (провайдер рендерит его по
// setupOpen). Благодаря этому «какой шаг раскрыт» инициализируется заново при
// каждом открытии — за время работы владелец мог закрыть предыдущий шаг.
export function SetupWizardModal({
  state,
  onClose,
}: {
  state: AccountingSetupState;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const w = t.setupWizard;

  // Раскрытый шаг: по умолчанию первый незакрытый — мастер ведёт по порядку.
  // Остальные свёрнуты в строку, чтобы окно не превращалось в простыню.
  const firstPending = state.steps.find((s) => !s.done)?.id ?? null;
  const [expanded, setExpanded] = useState<SetupStepId | null>(firstPending);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Раскрыли шаг — подтягиваем его к верхней кромке списка, иначе длинная
  // инструкция уходит хвостом под нижний край (замечание владельца).
  // Скроллим сам контейнер, а не через scrollIntoView элемента: у окна свои
  // вложенные прокрутки, и браузер выбирал не тот предок. Задержка — чтобы
  // высота считалась уже по РАЗВЁРНУТОМУ блоку.
  useEffect(() => {
    if (!expanded) return;
    const list = listRef.current;
    if (!list) return;
    const id = window.setTimeout(() => {
      const el = list.querySelector<HTMLElement>(`[data-step="${expanded}"]`);
      if (!el) return;
      const top = Math.max(
        0,
        el.getBoundingClientRect().top -
          list.getBoundingClientRect().top +
          list.scrollTop -
          4,
      );
      // Прокрутка мгновенная, БЕЗ behavior:'smooth' — намеренно. Плавная
      // анимация в части сред не доезжает до конца и перекрывает попытку
      // доставить скролл вручную, оставляя блок наполовину за кромкой. Блок
      // в этот момент и так перестраивается, поэтому рывка не читается.
      list.scrollTop = top;
    }, 160);
    return () => window.clearTimeout(id);
  }, [expanded]);

  if (typeof document === 'undefined') return null;

  const { steps, doneCount, totalCount, allDone } = state;
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={w.ariaLabel}
    >
      <button
        type="button"
        aria-label={w.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay backdrop-blur-[10px] animate-[wm-fade_220ms_ease-out]"
      />

      <div className="relative z-10 flex max-h-[94vh] w-[min(880px,96vw)] flex-col overflow-hidden rounded-modal border border-border bg-surface shadow-[var(--shadow-pop)] antialiased animate-[wm-pop_280ms_var(--ease-out)]">
        {/* Шапка. Красная (2026-07-30, владелец): это не «что нового», а
            незакрытый долг по учёту — тон должен читаться как «важно».
            Градиент по токенам --error → --error-text: белый текст проходит
            AA на обоих концах (4.53 и 5.9), в отличие от --grad-rose. */}
        <div
          className="relative flex flex-col gap-1.5 px-7 pb-4 pt-5 text-white"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--error) 0%, var(--error-text) 100%)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={w.close}
            className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X size={16} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
            <ClipboardList size={13} strokeWidth={2.25} />
            {w.badge}
          </div>

          <h2 className="max-w-[34ch] text-[19px] font-extrabold leading-[1.25] tracking-[-0.01em]">
            {allDone ? w.allDone.title : w.title}
          </h2>
          <p className="max-w-[70ch] text-[12.5px] font-[450] leading-[1.5] text-white/90">
            {allDone ? w.allDone.body : w.lead}
          </p>

          {/* Прогресс — счётчик и полоса в одну строку, чтобы шапка не росла. */}
          {totalCount > 0 && (
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-white">
                {fmt(w.progress, { done: doneCount, total: totalCount })}
              </span>
              <div
                className="h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/30"
                role="progressbar"
                aria-valuenow={doneCount}
                aria-valuemin={0}
                aria-valuemax={totalCount}
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-[--dur-medium] ease-[--ease-out]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Тело — шаги. Обёртка нужна ради подсказки прокрутки: без неё
            длинная инструкция обрывалась ровно по краю и читалась как
            обрезанный текст, а не как «ниже есть ещё» (замечание владельца). */}
        {/* Фон тела — холодный серый, как рабочая зона приложения: на белом
            фоне белые карточки шагов сливались (замечание владельца). */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-bg">
          <div
            ref={listRef}
            className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-6 py-5"
          >
            {steps.map((step, i) => (
              <StepBlock
                key={step.id}
                step={step}
                index={i + 1}
                expanded={expanded === step.id}
                onToggle={() =>
                  setExpanded((cur) => (cur === step.id ? null : step.id))
                }
                onNavigate={onClose}
              />
            ))}
          </div>
          {/* Затухание у нижней кромки — видно, что список продолжается. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-bg to-transparent"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-7 py-3.5">
          <Button size="sm" variant="secondary" className="px-5" onClick={onClose}>
            {allDone ? w.gotIt : w.later}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StepBlock({
  step,
  index,
  expanded,
  onToggle,
  onNavigate,
}: {
  step: SetupStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const { t, fmt, plural } = useI18n();
  const w = t.setupWizard;
  const s = w.steps[step.id];
  const Icon = STEP_ICONS[step.id];

  // Счета «не сделаны» по двум разным причинам: их нет вовсе (тогда основной
  // текст) либо у части осталась дата создания (тогда предупреждение).
  const stale = step.id === 'accounts' && step.count > 0;
  const why = stale
    ? `${plural(w.steps.accounts.staleWarning, step.count)} ${w.steps.accounts.staleWhy}`
    : fmt(s.why, { n: step.count });

  return (
    <div
      data-step={step.id}
      className={cn(
        // Тень поднимает карточку над серым фоном тела; раскрытая — заметно
        // выше остальных, чтобы взгляд сразу шёл к текущему шагу.
        'shrink-0 overflow-hidden rounded-card border transition-[box-shadow,border-color] duration-[--dur-short]',
        step.done
          ? 'border-success/30 bg-success-bg/60 shadow-[var(--shadow-xs)]'
          : expanded
            ? 'border-primary-border bg-surface shadow-[var(--shadow-md)]'
            : 'border-border bg-surface shadow-[var(--shadow-sm)]',
      )}
    >
      {/* Заголовок шага — кликабельный (сворачивает/разворачивает). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-softer/60"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            step.done
              ? 'bg-success/15 text-success-text'
              : 'bg-primary-subtle text-primary',
          )}
        >
          {step.done ? (
            <Check size={16} strokeWidth={2.5} />
          ) : (
            <Icon size={16} strokeWidth={1.9} />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-subtle">
              {fmt(w.stepNumber, { n: index })}
            </span>
            {step.done && (
              <span className="inline-flex items-center gap-1 rounded-chip bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success-text">
                <Check size={11} strokeWidth={2.75} />
                {w.stepDone}
              </span>
            )}
          </span>
          <span
            className={cn(
              'truncate text-[14.5px] font-semibold',
              step.done ? 'text-text-muted' : 'text-text',
            )}
          >
            {s.title}
          </span>
        </span>

        <ChevronDown
          size={17}
          strokeWidth={2}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-text-subtle transition-transform duration-[--dur-short]',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-4">
          {/* Зачем. Для счетов с дефолтной датой — тон предупреждения. */}
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-control px-3.5 py-3',
              stale ? 'bg-warning-bg/70' : 'bg-surface-muted',
            )}
          >
            {stale ? (
              <TriangleAlert
                size={15}
                strokeWidth={2}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-warning"
              />
            ) : (
              <Info
                size={15}
                strokeWidth={2}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-info"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span
                className={cn(
                  'text-[11px] font-bold uppercase tracking-[0.05em]',
                  stale ? 'text-warning-text' : 'text-text-muted',
                )}
              >
                {w.whyHeading}
              </span>
              <p
                className={cn(
                  'text-[13.5px] leading-[1.6]',
                  stale ? 'text-warning-text' : 'text-text',
                )}
              >
                {why}
              </p>
            </div>
          </div>

          {/* Как. Нумерованная инструкция — то, ради чего окно и существует. */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-muted">
              {w.howHeading}
            </span>
            <ol className="flex flex-col gap-2">
              {s.how.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[11px] font-bold tabular-nums text-primary"
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] leading-[1.6] text-text">
                    {fmt(line, { n: step.count })}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Действие. Заблокированный шаг (нет счетов) кнопку не показывает. */}
          {step.blocked ? (
            <p className="flex items-center gap-2 text-[12.5px] text-text-muted">
              <Lock size={13} strokeWidth={2} aria-hidden="true" />
              {w.blockedHint}
            </p>
          ) : (
            <Link
              href={step.href}
              onClick={onNavigate}
              className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-primary-hover hover:shadow-[var(--shadow-brand-hover)]"
            >
              {s.action}
              <ArrowRight size={14} strokeWidth={2.25} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
