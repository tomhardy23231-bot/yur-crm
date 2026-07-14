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
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg/70 px-4 backdrop-blur-xl sm:gap-4 sm:px-5">
      <h1 className="truncate text-[18px] font-bold tracking-tight text-text">
        {title}
      </h1>

      {/* Поиск — сразу после заголовка (каркас). Открывает палитру (Ctrl-K). */}
      <button
        type="button"
        onClick={open}
        data-tour="topbar-search"
        className="hidden h-8 w-[280px] items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 text-[13px] text-text-subtle transition-all duration-200 hover:border-primary-border hover:shadow-sm md:flex lg:w-[330px]"
        aria-label={t.topbar.searchAria}
      >
        <Search size={15} strokeWidth={2} className="shrink-0" />
        <span className="flex-1 truncate text-left">
          {t.topbar.searchButton}
        </span>
        <kbd className="rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
          Ctrl K
        </kbd>
      </button>

      {/* «Новое дело» — CTA с синей тенью, приподнимается на hover (каркас). */}
      {canCreateCase && (
        <Link
          href="/cases/new"
          data-tour="cases-new"
          className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary-hover px-3.5 text-[13px] font-semibold text-primary-fg shadow-brand transition-all duration-200 hover:-translate-y-px hover:shadow-brand-hover md:inline-flex"
        >
          <Plus size={15} strokeWidth={2.5} />
          {t.topbar.newCase}
        </Link>
      )}

      <div className="flex-1" />

      {/* Компактный поиск-иконка — только на мобильных (< md). */}
      <button
        type="button"
        onClick={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed md:hidden"
        aria-label={t.topbar.searchAria}
      >
        <Search size={17} strokeWidth={1.9} />
      </button>

      {/* Уведомления → задачи. Числовой бейдж (каркас): красный — есть
          просроченные, брендовый — только сегодняшние; нет горящего — чисто. */}
      <Link
        href="/tasks"
        aria-label={dueLabel}
        title={dueLabel}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed"
      >
        <Bell size={18} strokeWidth={1.9} />
        {dueTotal > 0 && (
          <span
            className={`absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none tabular-nums text-white ${
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
        className="flex items-center gap-2.5 rounded-full pl-1 transition-opacity hover:opacity-90"
      >
        <Avatar name={userName} size="sm" className="ring-2 ring-surface" />
        <div className="hidden leading-tight sm:block">
          <p className="text-[13px] font-semibold text-text">{userName}</p>
          <p className="text-[11px] text-text-muted">{roleLabel}</p>
        </div>
      </Link>
    </header>
  );
}
