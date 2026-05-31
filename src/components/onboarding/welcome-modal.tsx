'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Coins,
  GitBranch,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TourCtx } from '@/lib/onboarding/tour-steps';

type Slide = {
  icon: LucideIcon;
  title: string;
  lead: string;
  /** Доп. контент под текстом (этапы, ставки и т.п.). */
  extra?: React.ReactNode;
};

const STAGES: ReadonlyArray<{ label: string; varName: string }> = [
  { label: 'Новое обращение', varName: '--stage-new' },
  { label: 'Консультация', varName: '--stage-consultation' },
  { label: 'В работе', varName: '--stage-in-progress' },
  { label: 'Ожидание решения', varName: '--stage-awaiting' },
  { label: 'Завершено', varName: '--stage-closed' },
];

function roleVisibility(ctx: TourCtx): string {
  if (ctx.isStaff) {
    return 'Вы видите все дела компании и все финансы — полная картина по фирме.';
  }
  if (ctx.role === 'lawyer') {
    return 'Вы видите дела, где вы — юрист-продажник, и свои личные начисления.';
  }
  return 'Вы видите дела, где вы — эксперт-исполнитель, и свои личные начисления.';
}

function buildSlides(ctx: TourCtx): Slide[] {
  return [
    {
      icon: Sparkles,
      title: 'Добро пожаловать в ЮрКейс',
      lead:
        'Это CRM для юридической компании. За пару минут покажем, как всё устроено, ' +
        'и проведём по каждому разделу. Можно пропустить и вернуться к туру в любой момент.',
    },
    {
      icon: Briefcase,
      title: 'В центре всего — Дело',
      lead:
        'Главная сущность системы — «Дело» (оно же договор). Вокруг него собирается ' +
        'всё: клиент, документы, задачи и сроки, команда и деньги. Создаёте дело — и дальше вся работа идёт внутри него.',
    },
    {
      icon: GitBranch,
      title: 'Воронка из 5 этапов',
      lead:
        'Каждое дело проходит этапы. Движение — только вперёд: это держит порядок и историю в чистоте.',
      extra: (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {STAGES.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{
                  color: `var(${s.varName})`,
                  background: `var(${s.varName}-bg)`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: `var(${s.varName})` }}
                />
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <span className="text-text-subtle">→</span>
              )}
            </span>
          ))}
        </div>
      ),
    },
    {
      icon: ShieldCheck,
      title: 'Доступ — по ролям',
      lead:
        'Каждый видит ровно то, что нужно. Права заложены и в интерфейсе, и в самой ' +
        'базе данных — это безопасно для конфиденциальных данных клиентов.',
      extra: (
        <div className="mt-4 rounded-xl border border-primary-border bg-primary-subtle px-4 py-3 text-[13px] font-medium text-primary-pressed">
          {roleVisibility(ctx)}
        </div>
      ),
    },
    {
      icon: Coins,
      title: 'Зарплата считается сама',
      lead:
        'Зарплата команды — это процент от оплаченной клиентом суммы по делу. Процент ' +
        'зависит от категории дела. Ничего считать вручную не нужно.',
      extra: (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { k: 'Документ', v: '7%' },
            { k: 'Иск', v: '10%' },
            { k: 'Представительство', v: '25%' },
          ].map((r) => (
            <div
              key={r.k}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-center"
            >
              <div className="font-mono text-[20px] font-extrabold tabular-nums text-text">
                {r.v}
              </div>
              <div className="mt-0.5 text-[11.5px] text-text-muted">{r.k}</div>
            </div>
          ))}
        </div>
      ),
    },
  ];
}

export function WelcomeModal({
  open,
  userCtx,
  onStartTour,
  onSkip,
}: {
  open: boolean;
  userCtx: TourCtx;
  onStartTour: () => void;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);

  // Сброс на первый слайд при каждом открытии — паттерн «состояние от пропа»
  // (правка во время рендера, без эффекта).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIndex(0);
  }

  const slides = buildSlides(userCtx);
  const total = slides.length;
  const isLast = index === total - 1;

  const next = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Клавиатура: Esc — пропустить, стрелки — листать.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onSkip, next, prev]);

  if (!open || typeof document === 'undefined') return null;

  const slide = slides[index];
  if (!slide) return null;
  const Icon = slide.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с системой"
    >
      {/* Подложка */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onSkip}
        className="absolute inset-0 cursor-default bg-[#080A0F]/80 backdrop-blur-[4px] animate-[wm-fade_220ms_ease-out]"
      />

      {/* Карточка */}
      <div className="relative z-10 flex w-[min(680px,95vw)] flex-col overflow-hidden rounded-[24px] border border-border bg-surface shadow-[var(--shadow-pop)] antialiased animate-[wm-pop_280ms_var(--ease-out)]">
        {/* Hero — фирменный градиент */}
        <div
          className="relative flex flex-col items-center gap-3.5 px-9 pb-9 pt-11 text-center"
          style={{ backgroundImage: 'var(--grad-brass)' }}
        >
          <button
            type="button"
            onClick={onSkip}
            aria-label="Пропустить знакомство"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X size={17} strokeWidth={2} />
          </button>
          <span
            className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm transition-transform duration-300"
            aria-hidden="true"
            key={index /* лёгкая ре-анимация иконки при смене слайда */}
          >
            <Icon size={34} strokeWidth={1.75} className="animate-[wm-icon_320ms_var(--ease-out)]" />
          </span>
          <h2 className="text-[25px] font-extrabold leading-tight tracking-[-0.01em] text-white">
            {slide.title}
          </h2>
        </div>

        {/* Тело слайда */}
        <div className="px-9 py-7">
          <p className="text-[16px] font-[450] leading-[1.62] text-text">
            {slide.lead}
          </p>
          {slide.extra}
        </div>

        {/* Футер: точки прогресса + кнопки */}
        <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-muted/50 px-9 py-5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === index
                    ? 'w-5 bg-primary'
                    : i < index
                      ? 'w-1.5 bg-primary/40'
                      : 'w-1.5 bg-border-strong',
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={prev}>
                Назад
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={onStartTour} className="px-4">
                <Sparkles size={15} strokeWidth={2} />
                Начать тур
              </Button>
            ) : (
              <Button size="sm" onClick={next} className="px-4">
                Далее
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
