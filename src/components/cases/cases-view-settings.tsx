'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Columns3 } from 'lucide-react';

import {
  CASES_TOGGLEABLE_COLUMNS,
  casesGridMinWidth,
  casesGridTemplate,
  isCasesColumnId,
  type CasesColumnId,
} from '@/lib/cases/list-columns';
import { useLocalStorageValue, writeLocalStorage } from '@/lib/use-local-storage';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

// ============================================================================
// Настройка колонок списка дел (v4 полировка): видимость колонок хранится
// per-device в localStorage (useSyncExternalStore — без setState-в-эффекте).
// Провайдер отдаёт состояние; кнопка «Колонки» — поповер с чекбоксами; скоуп
// ставит CSS-переменные сетки + data-атрибут, по которому globals.css прячет
// ячейки (серверные строки не перерисовываются). SSR рендерит все колонки,
// клиентские настройки применяются сразу после гидрации.
// ============================================================================

const STORAGE_KEY = 'yurcase:cases:hidden-cols';

type CasesViewContextValue = {
  hidden: ReadonlySet<CasesColumnId>;
  toggle: (id: CasesColumnId) => void;
  showAll: () => void;
};

const CasesViewContext = createContext<CasesViewContextValue | null>(null);

function useCasesView(): CasesViewContextValue {
  const ctx = useContext(CasesViewContext);
  if (!ctx) throw new Error('useCasesView outside CasesViewProvider');
  return ctx;
}

function parseHidden(raw: string | null): ReadonlySet<CasesColumnId> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (v): v is CasesColumnId => typeof v === 'string' && isCasesColumnId(v),
      ),
    );
  } catch {
    return new Set(); // битый JSON — остаются все колонки
  }
}

export function CasesViewProvider({ children }: { children: ReactNode }) {
  const raw = useLocalStorageValue(STORAGE_KEY);
  const hidden = useMemo(() => parseHidden(raw), [raw]);

  const toggle = useCallback(
    (id: CasesColumnId) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeLocalStorage(STORAGE_KEY, JSON.stringify([...next]));
    },
    [hidden],
  );

  const showAll = useCallback(() => {
    writeLocalStorage(STORAGE_KEY, null);
  }, []);

  const value = useMemo(() => ({ hidden, toggle, showAll }), [hidden, toggle, showAll]);

  return <CasesViewContext.Provider value={value}>{children}</CasesViewContext.Provider>;
}

// Скоуп сетки: CSS-переменные шаблона/мин-ширины + список скрытых колонок для
// CSS-правил в globals.css. Оборачивает серверный CardListShell как children.
export function CasesColumnsScope({ children }: { children: ReactNode }) {
  const { hidden } = useCasesView();
  const style = {
    '--cases-cols': casesGridTemplate(hidden),
    '--cases-minw': `${casesGridMinWidth(hidden)}px`,
  } as CSSProperties;
  return (
    <div style={style} data-cols-hidden={hidden.size > 0 ? [...hidden].join(' ') : undefined}>
      {children}
    </div>
  );
}

// Кнопка «Колонки» с поповером-чекбоксами (паттерн CasesMoreFilters). Видна
// только ≥ md — на мобильных список идёт карточками без колонок.
export function CasesColumnsButton() {
  const { t } = useI18n();
  const { hidden, toggle, showAll } = useCasesView();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const tgt = e.target as Element | null;
      if (ref.current && !ref.current.contains(tgt)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const labels: Record<CasesColumnId, string> = {
    stage: t.cases.columns.stage,
    category: t.cases.columns.category,
    priority: t.cases.columns.priority,
    expert: t.cases.columns.expert,
    opened: t.cases.columns.openedAt,
    sum: t.cases.columns.sum,
    debt: t.cases.columns.debt,
  };

  return (
    <div ref={ref} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium transition-colors',
          hidden.size > 0
            ? 'border-primary-border bg-primary-subtle text-primary'
            : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
        )}
      >
        <Columns3 size={15} strokeWidth={1.75} />
        {t.cases.columnsMenu.button}
        {hidden.size > 0 && (
          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-fg">
            {hidden.size}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t.cases.columnsMenu.aria}
          className="absolute right-0 top-full z-40 mt-1.5 flex w-[min(240px,85vw)] flex-col gap-1 rounded-card border border-border bg-surface p-2.5 shadow-lg"
        >
          <p className="px-1.5 pb-1 text-[12px] text-text-muted">
            {t.cases.columnsMenu.hint}
          </p>
          {CASES_TOGGLEABLE_COLUMNS.map((col) => (
            <label
              key={col.id}
              className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] text-text transition-colors hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.id)}
                onChange={() => toggle(col.id)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              {labels[col.id]}
            </label>
          ))}
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={showAll}
              className="mt-1 self-start px-1.5 text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {t.cases.columnsMenu.reset}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
