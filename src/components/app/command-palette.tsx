'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Calendar,
  CheckSquare,
  FilePlus,
  FileText,
  Home,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  EMPTY_RESULTS,
  type PaletteResults,
} from '@/lib/search/types';
import { type EffectiveCaps } from '@/lib/types/db';
import { useI18n } from '@/lib/i18n/provider';

// ============================================================================
// Context — sidebar-trigger открывает палитру без prop-drilling.
// ============================================================================

type Ctx = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const CommandPaletteContext = createContext<Ctx | null>(null);

export function useCommandPalette(): Ctx {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return ctx;
}

// ============================================================================
// Provider — оборачивает app-shell, держит open-state, рендерит Dialog,
// слушает Cmd+K / Ctrl+K глобально.
// ============================================================================

const SEARCH_DEBOUNCE_MS = 180;
const MIN_QUERY_LEN = 2;

export function CommandPaletteProvider({
  caps,
  children,
}: {
  caps: EffectiveCaps;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [serverResults, setServerResults] = useState<PaletteResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const openRef = useRef(false);

  // Производный display: для коротких запросов показываем пустые группы
  // (не туда из БД лезть на «к»). serverResults НЕ дёргаем в effect'е,
  // чтобы не триггерить set-state-in-effect lint.
  const isShortQuery = query.trim().length < MIN_QUERY_LEN;
  const displayResults = isShortQuery ? EMPTY_RESULTS : serverResults;

  const reset = useCallback(() => {
    setQuery('');
    setServerResults(EMPTY_RESULTS);
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // onOpenChange ловит все пути закрытия: Esc, click-outside, item-select.
  // При закрытии — сбрасываем стейт здесь (event handler, не effect body → lint ok).
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      setIsOpen(next);
      openRef.current = next;
    },
    [reset],
  );

  const open = useCallback(() => handleOpenChange(true), [handleOpenChange]);
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

  // Cmd+K / Ctrl+K — глобальный toggle. openRef избегает stale-closure +
  // setState в effect body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleOpenChange(!openRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleOpenChange]);

  // Debounced fetch. Эффект ТОЛЬКО планирует таймер; setState'ы происходят
  // внутри async-callback'а (не в теле эффекта), что разрешено правилом.
  useEffect(() => {
    if (!isOpen) return;
    if (isShortQuery) return;

    const q = query.trim();
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!ctrl.signal.aborted) setServerResults(EMPTY_RESULTS);
          return;
        }
        const data = (await res.json()) as PaletteResults;
        if (!ctrl.signal.aborted) setServerResults(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('command-palette search failed:', err);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, isOpen, isShortQuery]);

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [router, handleOpenChange],
  );

  // Гейтинг по эффективным правам (роль + персональные оверрайды).
  const canCreateCase = caps.create_cases;
  const canCreateClient = caps.create_clients;

  const ctx = useMemo<Ctx>(() => ({ isOpen, open, close }), [isOpen, open, close]);

  const hasAnyResults =
    displayResults.cases.length > 0 ||
    displayResults.clients.length > 0 ||
    displayResults.tasks.length > 0 ||
    displayResults.documents.length > 0;

  const showEmpty =
    !isShortQuery && !loading && !hasAnyResults;

  return (
    <CommandPaletteContext.Provider value={ctx}>
      {children}

      <Command.Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        label={t.commandPalette.dialogLabel}
        shouldFilter={false}
        className={cn(
          'fixed left-1/2 top-[18%] z-50 -translate-x-1/2',
          'w-[min(640px,92vw)] rounded-xl bg-surface shadow-xl border border-border',
          'overflow-hidden',
        )}
        overlayClassName="fixed inset-0 z-40 bg-text/15 backdrop-blur-[2px]"
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-border">
          <Search size={16} strokeWidth={1.75} className="text-text-muted shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={t.commandPalette.inputPlaceholder}
            className={cn(
              'flex-1 bg-transparent outline-none text-[14px] text-text',
              'placeholder:text-text-subtle',
            )}
            autoFocus
          />
          <kbd className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-subtle bg-surface-muted border border-border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto py-2">
          {showEmpty && (
            <Command.Empty className="px-4 py-6 text-center text-[13px] text-text-muted">
              {t.commandPalette.empty}
            </Command.Empty>
          )}

          {/* Действия — всегда видны, role-gated */}
          <PaletteGroup heading={t.commandPalette.groupActions}>
            {canCreateCase && (
              <PaletteItem
                value="action create case дело справа"
                onSelect={() => go('/cases/new')}
                icon={<FilePlus size={15} strokeWidth={1.75} />}
                label={t.commandPalette.createCase}
                hint={t.commandPalette.createCaseHint}
              />
            )}
            {canCreateClient && (
              <PaletteItem
                value="action create client клиент клієнт"
                onSelect={() => go('/clients/new')}
                icon={<UserPlus size={15} strokeWidth={1.75} />}
                label={t.commandPalette.createClient}
                hint={t.commandPalette.createClientHint}
              />
            )}
            <PaletteItem
              value="nav home главная головна"
              onSelect={() => go('/')}
              icon={<Home size={15} strokeWidth={1.75} />}
              label={t.commandPalette.navHome}
            />
            <PaletteItem
              value="nav cases дела справи"
              onSelect={() => go('/cases')}
              icon={<Briefcase size={15} strokeWidth={1.75} />}
              label={t.commandPalette.navCases}
            />
            <PaletteItem
              value="nav clients клиенты клієнти"
              onSelect={() => go('/clients')}
              icon={<Users size={15} strokeWidth={1.75} />}
              label={t.commandPalette.navClients}
            />
            <PaletteItem
              value="nav tasks задачи завдання"
              onSelect={() => go('/tasks')}
              icon={<CheckSquare size={15} strokeWidth={1.75} />}
              label={t.commandPalette.navTasks}
            />
            <PaletteItem
              value="nav calendar календарь календар заседания засідання"
              onSelect={() => go('/calendar')}
              icon={<Calendar size={15} strokeWidth={1.75} />}
              label={t.commandPalette.navCalendar}
            />
          </PaletteGroup>

          {displayResults.cases.length > 0 && (
            <PaletteGroup heading={t.commandPalette.groupCases}>
              {displayResults.cases.map((c) => (
                <PaletteItem
                  key={c.id}
                  value={`case-${c.id}`}
                  onSelect={() => go(`/cases/${c.id}`)}
                  icon={<Briefcase size={15} strokeWidth={1.75} />}
                  label={c.number_title}
                  hint={c.client_name ?? undefined}
                />
              ))}
            </PaletteGroup>
          )}

          {displayResults.clients.length > 0 && (
            <PaletteGroup heading={t.commandPalette.groupClients}>
              {displayResults.clients.map((c) => (
                <PaletteItem
                  key={c.id}
                  value={`client-${c.id}`}
                  onSelect={() => go(`/clients/${c.id}`)}
                  icon={<Users size={15} strokeWidth={1.75} />}
                  label={c.name}
                  hint={t.enums.clientKind[c.client_kind]}
                />
              ))}
            </PaletteGroup>
          )}

          {displayResults.tasks.length > 0 && (
            <PaletteGroup heading={t.commandPalette.groupTasks}>
              {displayResults.tasks.map((t) => (
                <PaletteItem
                  key={t.id}
                  value={`task-${t.id}`}
                  onSelect={() => go(`/cases/${t.case_id}`)}
                  icon={<CheckSquare size={15} strokeWidth={1.75} />}
                  label={t.title}
                  hint={t.case_number ?? undefined}
                  strikethrough={t.status === 'done'}
                />
              ))}
            </PaletteGroup>
          )}

          {displayResults.documents.length > 0 && (
            <PaletteGroup heading={t.commandPalette.groupDocuments}>
              {displayResults.documents.map((d) => (
                <PaletteItem
                  key={d.id}
                  value={`document-${d.id}`}
                  // LOW#9: якорь #document-<id> ведёт прямо к нужной строке
                  // в карточке дела + target: подсвечивает её на секунду.
                  onSelect={() => go(`/cases/${d.case_id}#document-${d.id}`)}
                  icon={<FileText size={15} strokeWidth={1.75} />}
                  label={d.file_name}
                  hint={d.case_number ?? undefined}
                />
              ))}
            </PaletteGroup>
          )}

          {loading && (
            <div className="px-4 py-2 text-[12px] text-text-subtle">
              {t.commandPalette.searching}
            </div>
          )}
        </Command.List>

        <div className="flex items-center gap-3 px-4 h-9 border-t border-border bg-surface-muted/40 text-[11px] text-text-subtle">
          <span>
            <kbd className="font-mono">↵</kbd> {t.commandPalette.footerSelect}
          </span>
          <span>
            <kbd className="font-mono">↑↓</kbd> {t.commandPalette.footerNavigate}
          </span>
          <span className="ml-auto">
            <kbd className="font-mono">Cmd/Ctrl+K</kbd> {t.commandPalette.footerToggle}
          </span>
        </div>
      </Command.Dialog>
    </CommandPaletteContext.Provider>
  );
}

// ============================================================================
// Внутренние UI-частники
// ============================================================================

function PaletteGroup({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className={cn(
        '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5',
        '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase',
        '[&_[cmdk-group-heading]]:tracking-[0.05em]',
        '[&_[cmdk-group-heading]]:text-text-subtle [&_[cmdk-group-heading]]:font-semibold',
        '[&_[cmdk-group-heading]]:mt-2',
      )}
    >
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  value,
  onSelect,
  icon,
  label,
  hint,
  strikethrough,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  strikethrough?: boolean;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'group flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-md cursor-pointer',
        'text-[13.5px] text-text',
        'data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary',
        'transition-colors duration-[60ms]',
      )}
    >
      <span className="text-text-muted shrink-0 group-data-[selected=true]:text-primary">
        {icon}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 truncate',
          strikethrough && 'line-through text-text-muted',
        )}
      >
        {label}
      </span>
      {hint && (
        <span className="text-[12px] text-text-subtle shrink-0 truncate max-w-[40%]">
          {hint}
        </span>
      )}
    </Command.Item>
  );
}

// ============================================================================
// SearchTrigger — кнопка для sidebar'а, открывает палитру кликом.
// ============================================================================

export function CommandPaletteTrigger() {
  const { open } = useCommandPalette();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex items-center gap-2 mx-3 mt-3 mb-1 h-9 px-3 rounded-md',
        'bg-sidebar-elevated hover:bg-sidebar-hover-bg transition-colors duration-[80ms]',
        'text-[13px] text-sidebar-text hover:text-sidebar-text-strong',
        'border border-sidebar-border hover:border-sidebar-active-bg',
      )}
      aria-label={t.commandPalette.triggerAria}
    >
      <Search size={14} strokeWidth={1.75} />
      <span className="flex-1 text-left">{t.commandPalette.triggerLabel}</span>
      <kbd className="font-mono text-[10px] uppercase tracking-[0.04em] text-sidebar-text bg-sidebar-bg border border-sidebar-border rounded px-1.5 py-0.5">
        Ctrl K
      </kbd>
    </button>
  );
}
