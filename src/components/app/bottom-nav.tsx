'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  CheckSquare,
  LayoutDashboard,
  Menu,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { EffectiveCaps } from '@/lib/types/db';

import { MobileMoreSheet } from './mobile-more-sheet';

// Нижняя навигация (как в нативных приложениях) — видна только на мобильных
// (< md), где боковой рейл скрыт. Четыре главных раздела + вкладка «Ещё»,
// открывающая шторку с остальным. Активная вкладка: «пилюля» под иконкой
// (Material 3) + цветная подпись. Учитывает safe-area снизу.

type Tab = {
  id: string;
  href: string;
  icon: LucideIcon;
  label: string;
  /** Активна, если текущий путь подходит. */
  isActive: (path: string) => boolean;
  /** Точка-индикатор (открытые задачи). */
  badge?: boolean;
};

export function BottomNav({
  caps,
  counts,
  userName,
  roleLabel,
}: {
  caps: EffectiveCaps;
  counts: { tasksOpen: number };
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs: Tab[] = [
    {
      id: 'home',
      href: '/',
      icon: LayoutDashboard,
      label: t.nav.home,
      isActive: (p) => p === '/',
    },
    {
      id: 'cases',
      href: '/cases',
      icon: Briefcase,
      label: t.nav.cases,
      isActive: (p) => p.startsWith('/cases'),
    },
    {
      id: 'clients',
      href: '/clients',
      icon: Users,
      label: t.nav.clients,
      isActive: (p) => p.startsWith('/clients'),
    },
    {
      id: 'tasks',
      href: '/tasks',
      icon: CheckSquare,
      label: t.nav.tasks,
      isActive: (p) => p.startsWith('/tasks'),
      badge: counts.tasksOpen > 0,
    },
  ];

  // «Ещё» подсвечивается, когда открыт любой второстепенный раздел или сама шторка.
  const MORE_PREFIXES = ['/calendar', '/reports', '/settings', '/profile', '/help'];
  const moreActive = moreOpen || MORE_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <>
      <nav
        aria-label={t.nav.menuAria}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 md:hidden',
          'border-t border-border bg-surface/92 backdrop-blur-lg',
          'animate-bottomnav-in',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {tabs.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="group flex flex-1 select-none flex-col items-center gap-1 px-1 pb-1 pt-2"
              >
                <span
                  className={cn(
                    'relative inline-flex h-8 w-[60px] items-center justify-center rounded-full',
                    'transition-[background-color,color] duration-200 ease-out',
                    active
                      ? 'bg-primary-subtle text-primary'
                      : 'text-text-subtle group-active:bg-surface-sunken',
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.15 : 1.85} />
                  {tab.badge && (
                    <span
                      aria-hidden
                      className="absolute right-2.5 top-1 h-2 w-2 rounded-full bg-error ring-2 ring-surface"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[10.5px] font-semibold leading-none tracking-[0.01em]',
                    active ? 'text-primary' : 'text-text-subtle',
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* Вкладка «Ещё» — открывает шторку */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="group flex flex-1 select-none flex-col items-center gap-1 px-1 pb-1 pt-2"
          >
            <span
              className={cn(
                'inline-flex h-8 w-[60px] items-center justify-center rounded-full',
                'transition-[background-color,color] duration-200 ease-out',
                moreActive
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-subtle group-active:bg-surface-sunken',
              )}
            >
              <Menu size={21} strokeWidth={moreActive ? 2.15 : 1.85} />
            </span>
            <span
              className={cn(
                'text-[10.5px] font-semibold leading-none tracking-[0.01em]',
                moreActive ? 'text-primary' : 'text-text-subtle',
              )}
            >
              {t.nav.more}
            </span>
          </button>
        </div>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        caps={caps}
        userName={userName}
        roleLabel={roleLabel}
      />
    </>
  );
}
