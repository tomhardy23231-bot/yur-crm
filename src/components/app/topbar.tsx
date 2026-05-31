'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, HelpCircle, Search } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { useCommandPalette } from './command-palette';

// Заголовок страницы по маршруту (топбар — единый источник названия экрана,
// поэтому крупные h1 на страницах-списках убраны).
function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Дашборд';

  if (pathname === '/cases/board') return 'Доска дел';
  if (pathname === '/cases/new') return 'Новое дело';
  if (/^\/cases\/[^/]+\/edit$/.test(pathname)) return 'Редактирование дела';
  if (/^\/cases\/[^/]+$/.test(pathname)) return 'Карточка дела';
  if (pathname.startsWith('/cases')) return 'Дела';

  if (pathname === '/clients/new') return 'Новый клиент';
  if (/^\/clients\/[^/]+\/edit$/.test(pathname)) return 'Редактирование клиента';
  if (/^\/clients\/[^/]+$/.test(pathname)) return 'Карточка клиента';
  if (pathname.startsWith('/clients')) return 'Клиенты';

  if (pathname.startsWith('/tasks')) return 'Задачи';
  if (pathname.startsWith('/calendar')) return 'Календарь';
  if (pathname.startsWith('/reports/payroll')) return 'Финансы и ЗП';
  if (pathname.startsWith('/settings/payroll')) return 'Ставки зарплаты';
  if (pathname.startsWith('/settings/users')) return 'Пользователи';
  if (pathname.startsWith('/settings')) return 'Настройки';

  return 'ЮрКейс';
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
  const title = titleForPath(pathname);

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
        aria-label="Поиск по делам, клиентам"
      >
        <Search size={15} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 truncate text-left">
          Поиск по делам, клиентам…
        </span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-subtle">
          Ctrl K
        </kbd>
      </button>

      {/* Справка и онбординг-тур. */}
      <Link
        href="/help"
        data-tour="topbar-help"
        aria-label="Справка и обучающий тур"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <HelpCircle size={17} strokeWidth={1.75} />
      </Link>

      {/* Уведомления → задачи (точка, если есть открытые задачи на мне). */}
      <Link
        href="/tasks"
        aria-label={
          tasksOpen > 0 ? `Задачи: ${tasksOpen} открытых` : 'Задачи'
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
