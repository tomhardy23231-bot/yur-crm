import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/components/logout-button';
import type { CurrentUser } from '@/lib/auth/current-user';
import { ROLE_LABEL } from '@/lib/types/db';

import { SidebarNav, type SidebarCounts } from './sidebar-nav';

export function Sidebar({
  user,
  counts,
}: {
  user: CurrentUser;
  counts: SidebarCounts;
}) {
  const { profile } = user;
  const subtitle = ROLE_LABEL[profile.role];

  return (
    <aside
      className="app-sidebar hidden md:flex w-[232px] shrink-0 flex-col border-r border-sidebar-border"
      style={{ background: 'var(--sidebar-bg-gradient)' }}
    >
      <Link
        href="/"
        className="flex items-center gap-3 px-[22px] h-16 border-b border-sidebar-border"
      >
        <span
          className="inline-flex w-[38px] h-[38px] items-center justify-center rounded-[10px] text-[21px] font-bold leading-none shrink-0"
          style={{
            background: 'var(--grad-brass)',
            color: '#1A140A',
            boxShadow:
              '0 4px 14px rgba(184,138,62,.35), inset 0 1px 0 rgba(255,255,255,.25)',
          }}
          aria-hidden="true"
        >
          Ю
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-bold text-[19px] text-sidebar-text-strong tracking-[-0.01em]">
            ЮрКейс
          </span>
          <span className="mt-[3px] text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-text-disabled">
            Legal CRM
          </span>
        </span>
      </Link>

      <SidebarNav counts={counts} role={profile.role} />

      <div className="border-t border-sidebar-border p-3.5">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-elevated px-2.5 py-2">
          <Avatar name={profile.full_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-sidebar-text-strong truncate leading-tight">
              {profile.full_name}
            </p>
            <p className="text-[11.5px] text-sidebar-text-disabled truncate">
              {subtitle}
            </p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
