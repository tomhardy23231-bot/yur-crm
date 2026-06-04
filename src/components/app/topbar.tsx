'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, HelpCircle, Search } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { useI18n } from '@/lib/i18n/provider';
import type { Messages } from '@/lib/i18n/messages';
import { useCommandPalette } from './command-palette';

// Заголовок страницы по маршруту (топбар — единый источник названия экрана,
// поэтому крупные h1 на страницах-списках убраны).
function titleForPath(pathname: string, tb: Messages['topbar']): string {
  if (pathname === '/') return tb.titleDashboard;

  if (pathname === '/cases/board') return tb.titleCasesBoard;
  if (pathname === '/cases/new') return tb.titleCaseNew;
  if (/^\/cases\/[^/]+\/edit$/.test(pathname)) return tb.titleCaseEdit;
  if (/^\/cases\/[^/]+$/.test(pathname)) return tb.titleCaseCard;
  if (pathname.startsWith('/cases')) return tb.titleCases;

  if (pathname === '/clients/new') return tb.titleClientNew;
  if (/^\/clients\/[^/]+\/edit$/.test(pathname)) return tb.titleClientEdit;
  if (/^\/clients\/[^/]+$/.test(pathname)) return tb.titleClientCard;
  if (pathname.startsWith('/clients')) return tb.titleClients;

  if (pathname.startsWith('/tasks')) return tb.titleTasks;
  if (pathname.startsWith('/calendar')) return tb.titleCalendar;
  if (pathname.startsWith('/reports/payroll')) return tb.titlePayroll;
  if (pathname.startsWith('/settings/payroll')) return tb.titleRates;
  if (pathname.startsWith('/settings/users')) return tb.titleUsers;
  if (pathname.startsWith('/profile')) return tb.titleProfile;
  if (pathname.startsWith('/settings')) return tb.titleSettings;
  if (pathname.startsWith('/help')) return tb.titleHelp;

  return tb.titleFallback;
}

// Глобальный верхний бар: заголовок страницы + поиск + уведомления + пользователь.
export function Topbar({
  userName,
  roleLabel,
  tasksOpen,
}: {
  userName: string;
  roleLabel: string;
  tasksOpen: number;
}) {
  const pathname = usePathname();
  const { open } = useCommandPalette();
  const { t, fmt } = useI18n();
  const title = titleForPath(pathname, t.topbar);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-5 backdrop-blur-md sm:gap-4 sm:px-6">
      <h1 className="truncate text-[17px] font-bold tracking-[-0.01em] text-text">
        {title}
      </h1>

      <div className="flex-1" />

      {/* Поиск — открывает командную палитру (Cmd/Ctrl-K). */}
      <button
        type="button"
        onClick={open}
        data-tour="topbar-search"
        className="hidden h-9 w-[260px] items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 text-[13px] text-text-subtle transition-colors hover:border-border-strong hover:bg-surface md:flex lg:w-[300px]"
        aria-label={t.topbar.searchAria}
      >
        <Search size={15} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 truncate text-left">
          {t.topbar.searchButton}
        </span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-subtle">
          Ctrl K
        </kbd>
      </button>

      {/* Справка и онбординг-тур. */}
      <Link
        href="/help"
        data-tour="topbar-help"
        aria-label={t.topbar.helpAria}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <HelpCircle size={17} strokeWidth={1.75} />
      </Link>

      {/* Уведомления → задачи (точка, если есть открытые задачи на мне). */}
      <Link
        href="/tasks"
        aria-label={
          tasksOpen > 0
            ? fmt(t.topbar.notificationsAriaCount, { count: tasksOpen })
            : t.topbar.notificationsAria
        }
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <Bell size={17} strokeWidth={1.75} />
        {tasksOpen > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-error ring-2 ring-surface" />
        )}
      </Link>

      {/* Пользователь */}
      <div className="flex items-center gap-2.5 pl-1">
        <Avatar name={userName} size="md" />
        <div className="hidden leading-tight sm:block">
          <p className="text-[13px] font-semibold text-text">{userName}</p>
          <p className="text-[11px] text-text-muted">{roleLabel}</p>
        </div>
      </div>
    </header>
  );
}
