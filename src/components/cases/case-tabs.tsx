'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

// Настоящие вкладки разделов карточки дела (редизайн Волна 1) — заменяют
// якоря-скроллы. Все панели рендерятся на сервере и передаются как
// ReactNode-пропсы; клиент только переключает видимую (`hidden`), поэтому
// переключение мгновенное и без повторных запросов. Пустые разделы не занимают
// экран; счётчик на корешке (> 0) подсказывает, где есть работа.
//
// Доступность (WAI-ARIA Tabs): role=tablist/tab/tabpanel, aria-controls /
// aria-labelledby, roving tabindex и навигация стрелками (←/→/Home/End).
// Активация извне (deep-link #plan, якоря, быстрые действия шапки) — через hash
// и CustomEvent 'casecard:tab'.

export interface CaseTab {
  key: string;
  label: string;
  /** Бейдж-счётчик: показывается только когда > 0 (где есть работа). */
  count?: number;
  panel: ReactNode;
}

interface CaseTabsProps {
  tabs: CaseTab[];
  defaultTab?: string;
  /** Локализованный aria-label для tablist (передаётся со страницы). */
  ariaLabel: string;
}

export function CaseTabs({ tabs, defaultTab, ariaLabel }: CaseTabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key ?? '');
  const rootRef = useRef<HTMLDivElement>(null);

  // Активация по hash (deep-link/якорь) и по событию шапки. Зависимость — строка
  // ключей (стабильна между ре-рендерами при тех же вкладках).
  const keyStr = tabs.map((tb) => tb.key).join(',');
  useEffect(() => {
    const keys = keyStr.split(',');
    function activate(k: string, scrollIntoView: boolean) {
      if (!k || !keys.includes(k)) return;
      setActive(k);
      if (scrollIntoView) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const reduced = window.matchMedia(
              '(prefers-reduced-motion: reduce)',
            ).matches;
            rootRef.current?.scrollIntoView({
              behavior: reduced ? 'auto' : 'smooth',
              block: 'start',
            });
          }),
        );
      }
    }
    const fromHash = () => activate(window.location.hash.replace('#', ''), true);
    const onEvt = (e: Event) =>
      activate((e as CustomEvent<{ key?: string }>).detail?.key ?? '', false);
    fromHash();
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('casecard:tab', onEvt as EventListener);
    return () => {
      window.removeEventListener('hashchange', fromHash);
      window.removeEventListener('casecard:tab', onEvt as EventListener);
    };
  }, [keyStr]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((tb) => tb.key === active);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const nk = tabs[next]?.key;
    if (!nk) return;
    setActive(nk);
    document.getElementById(`casetab-${nk}`)?.focus();
  }

  return (
    <div ref={rootRef} className="flex scroll-mt-16 flex-col gap-4">
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="no-scrollbar -mb-px flex items-center gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tb) => {
          const on = tb.key === active;
          return (
            <button
              key={tb.key}
              id={`casetab-${tb.key}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`casepanel-${tb.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tb.key)}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors',
                on
                  ? 'border-primary text-primary-pressed'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {tb.label}
              {typeof tb.count === 'number' && tb.count > 0 && (
                <span
                  className={cn(
                    'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] tabular-nums',
                    on
                      ? 'bg-primary-subtle text-info-text'
                      : 'bg-surface-sunken text-text-muted',
                  )}
                >
                  {tb.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tb) => (
        <div
          key={tb.key}
          id={`casepanel-${tb.key}`}
          role="tabpanel"
          aria-labelledby={`casetab-${tb.key}`}
          tabIndex={0}
          hidden={tb.key !== active}
        >
          {tb.panel}
        </div>
      ))}
    </div>
  );
}
