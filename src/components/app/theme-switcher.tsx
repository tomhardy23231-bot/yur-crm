'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

// Переключатель цветовой темы. Тема хранится в cookie `theme` (читается на
// сервере в src/app/layout.tsx → ставится на <html data-theme>, без мигания).
// Клик применяет тему мгновенно: правит data-theme прямо на <html> + пишет cookie.
//   teal  → :root[data-theme="teal"]  (активная по умолчанию)
//   brass → :root                     (классическая латунь, отсутствие атрибута)
//
// Hex-превью ниже — НАМЕРЕННО хардкод: плашка показывает обе палитры
// одновременно, поэтому не может читать токены активной темы.

export type Theme = 'teal' | 'brass';

const THEMES: {
  value: Theme;
  label: string;
  hint: string;
  grad: string;
  dots: string[]; // бренд · акцент · сайдбар · бумага
}[] = [
  {
    value: 'teal',
    label: 'Изумруд',
    hint: 'Teal · хвоя · крем',
    grad: 'linear-gradient(150deg, #0D9488 0%, #0A5F56 100%)',
    dots: ['#0D9488', '#5EEAD4', '#15302B', '#F4F2EC'],
  },
  {
    value: 'brass',
    label: 'Латунь',
    hint: 'Legal gold · ink · paper',
    grad: 'linear-gradient(150deg, #B88A3E 0%, #8F6A2C 100%)',
    dots: ['#B88A3E', '#D8AA55', '#1C212C', '#EEF1F6'],
  },
];

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

export function ThemeSwitcher({ current }: { current: Theme }) {
  const [theme, setTheme] = useState<Theme>(current);

  function apply(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    document.cookie = `theme=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    // Латунь = :root (без атрибута), teal = [data-theme="teal"].
    if (next === 'teal') {
      document.documentElement.dataset.theme = 'teal';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Цветовая тема"
      className="grid gap-3 sm:grid-cols-2"
    >
      {THEMES.map((t) => {
        const selected = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => apply(t.value)}
            className={[
              'group flex items-center gap-3.5 rounded-lg border p-3.5 text-left transition-all',
              selected
                ? 'border-primary bg-primary-subtle shadow-sm'
                : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted',
            ].join(' ')}
          >
            {/* Бренд-плашка темы */}
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[15px] font-bold text-white shadow-sm"
              style={{ background: t.grad }}
              aria-hidden="true"
            >
              Ю
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text">
                  {t.label}
                </span>
                {t.value === 'teal' && (
                  <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
                    по умолчанию
                  </span>
                )}
              </span>
              {/* Превью палитры — 4 кружка */}
              <span className="mt-1.5 flex items-center gap-1.5">
                {t.dots.map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                    style={{ background: c }}
                  />
                ))}
                <span className="ml-1 text-[11px] text-text-subtle">{t.hint}</span>
              </span>
            </span>

            {/* Маркер выбора */}
            <span
              className={[
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors',
                selected
                  ? 'bg-primary text-primary-fg'
                  : 'border border-border-strong text-transparent group-hover:border-text-subtle',
              ].join(' ')}
              aria-hidden="true"
            >
              <Check size={13} strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
