'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/components/logout-button';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types/db';

import { SidebarNav, type SidebarCounts } from './sidebar-nav';

const BRAND_SHADOW = 'var(--shadow-brand-tile)';

export function Sidebar({
  userName,
  roleLabel,
  role,
  counts,
  defaultCollapsed,
}: {
  userName: string;
  roleLabel: string;
  role: Role;
  counts: SidebarCounts;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      // Запоминаем в cookie — сервер прочитает при следующем рендере (без мигания).
      document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'app-sidebar t-resize hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border md:flex',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
      style={{ background: 'var(--sidebar-bg-gradient)' }}
    >
      {/* Бренд + переключатель */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-0' : 'gap-2 px-[15px]',
        )}
      >
        <Link
          href="/"
          aria-label="ЮрКейс — на главную"
          className={cn('flex min-w-0 items-center gap-3', !collapsed && 'flex-1')}
        >
          <span
            className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[21px] font-bold leading-none"
            style={{
              background: 'var(--grad-brass)',
              color: 'var(--brand-tile-fg)',
              boxShadow: BRAND_SHADOW,
            }}
            aria-hidden="true"
          >
            Ю
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-[19px] font-bold tracking-[-0.01em] text-sidebar-text-strong">
                ЮрКейс
              </span>
              <span className="mt-[3px] text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-text-disabled">
                Legal CRM
              </span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Свернуть меню"
            title="Свернуть меню"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-text transition-colors hover:bg-sidebar-hover-bg hover:text-sidebar-text-strong"
          >
            <PanelLeftClose size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Развернуть меню"
          title="Развернуть меню"
          className="mx-auto mt-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text transition-colors hover:bg-sidebar-hover-bg hover:text-sidebar-text-strong"
        >
          <PanelLeftOpen size={18} strokeWidth={1.75} />
        </button>
      )}

      <SidebarNav counts={counts} role={role} collapsed={collapsed} />

      {/* Пользователь */}
      <div className="shrink-0 border-t border-sidebar-border p-3.5">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link href="/profile" title={`${userName} — профиль`}>
              <Avatar name={userName} size="md" />
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-elevated px-2.5 py-2">
            <Link
              href="/profile"
              title="Профиль и безопасность"
              className="group flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar name={userName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold leading-tight text-sidebar-text-strong group-hover:underline">
                  {userName}
                </p>
                <p className="truncate text-[11.5px] text-sidebar-text-disabled">
                  {roleLabel}
                </p>
              </div>
            </Link>
            <LogoutButton />
          </div>
        )}
      </div>
    </aside>
  );
}
