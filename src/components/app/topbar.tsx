'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Plus, Search } from 'lucide-react';

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
  // Конкретные /reports/* и /settings/* — ВЫШЕ общих префиксов (порядок матчинга).
  if (pathname.startsWith('/reports/payroll')) return tb.titlePayroll;
  if (pathname.startsWith('/reports/cash')) return tb.cash;
  if (pathname.startsWith('/settings/payroll')) return tb.titleRates;
  if (pathname.startsWith('/settings/users')) return tb.titleUsers;
  if (pathname.startsWith('/settings/departments')) return tb.departments;
  if (pathname.startsWith('/settings/requisites')) return tb.requisites;
  if (pathname.startsWith('/profile')) return tb.titleProfile;
  if (pathname.startsWith('/settings')) return tb.titleSettings;
  if (pathname.startsWith('/help')) return tb.titleHelp;

  return tb.titleFallback;
}

// Глобальный верхний бар: заголовок страницы + поиск + «Новое дело» +
// уведомления + пользователь (композиция — макет владельца 2026-07-08).
export function Topbar({
  userName,
  roleLabel,
  tasksOverdue,
  tasksToday,
  canCreateCase,
}: {
  userName: string;
  roleLabel: string;
  /** Просроченные открытые задачи пользователя (due_at < now). */
  tasksOverdue: number;
  /** Открытые задачи со сроком сегодня по Киеву. */
  tasksToday: number;
  /** Право create_cases — показывает кнопку «Новое дело». */
  canCreateCase: boolean;
}) {
  const pathname = usePathname();
  const { open } = useCommandPalette();
  const { t, fmt } = useI18n();
  const title = titleForPath(pathname, t.topbar);

  // Честный колокольчик (v3 Сессия 6): считаем только горящее (просрочено +
  // сегодня), а не все открытые задачи. Красная точка — есть просрочка.
  const dueTotal = tasksOverdue + tasksToday;
  const dueLabel =
    dueTotal > 0
      ? fmt(t.topbar.notificationsDue, {
          overdue: tasksOverdue,
          today: tasksToday,
        })
      : t.topbar.notificationsAria;

  return (
    <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-5 backdrop-blur-md sm:gap-4 sm:px-6">
      <h1 className="truncate text-[17px] font-bold tracking-[-0.01em] text-text">
        {title}
      </h1>

      {/* Поиск — сразу после заголовка (макет). Открывает палитру (Ctrl-K). */}
      <button
        type="button"
        onClick={open}
        data-tour="topbar-search"
        className="hidden h-10 w-[280px] items-center gap-2 rounded-full border border-border bg-surface-sunken px-4 text-[13px] text-text-subtle transition-colors hover:border-border-strong hover:bg-surface md:flex lg:w-[330px]"
        aria-label={t.topbar.searchAria}
      >
        <Search size={15} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 truncate text-left">
          {t.topbar.searchButton}
        </span>
        <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-subtle">
          Ctrl K
        </kbd>
      </button>

      {/* «Новое дело» — главное действие всегда под рукой (право create_cases). */}
      {canCreateCase && (
        <Link
          href="/cases/new"
          data-tour="cases-new"
          style={{ boxShadow: 'var(--shadow-brand-badge)' }}
          className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4.5 text-[13.5px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover md:inline-flex"
        >
          <Plus size={16} strokeWidth={2.25} />
          {t.topbar.newCase}
        </Link>
      )}

      <div className="flex-1" />

      {/* Компактный поиск-иконка — только на мобильных (< md). */}
      <button
        type="button"
        onClick={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text md:hidden"
        aria-label={t.topbar.searchAria}
      >
        <Search size={17} strokeWidth={1.75} />
      </button>

      {/* Уведомления → задачи. Числовой бейдж (макет): красный — есть
          просроченные, брендовый — только сегодняшние; нет горящего — чисто. */}
      <Link
        href="/tasks"
        aria-label={dueLabel}
        title={dueLabel}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <Bell size={17} strokeWidth={1.75} />
        {dueTotal > 0 && (
          <span
            className={`absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-surface ${
              tasksOverdue > 0 ? 'bg-error' : 'bg-primary'
            }`}
          >
            {dueTotal > 9 ? '9+' : dueTotal}
          </span>
        )}
      </Link>

      {/* Пользователь → профиль (на мобильных профиль также в шторке «Ещё»). */}
      <Link
        href="/profile"
        aria-label={t.nav.profileAria}
        className="flex items-center gap-2.5 rounded-md pl-1 transition-opacity hover:opacity-90"
      >
        <Avatar name={userName} size="md" />
        <div className="hidden leading-tight sm:block">
          <p className="text-[13px] font-semibold text-text">{userName}</p>
          <p className="text-[11px] text-text-muted">{roleLabel}</p>
        </div>
      </Link>
    </header>
  );
}
