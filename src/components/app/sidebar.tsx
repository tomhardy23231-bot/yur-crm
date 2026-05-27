import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/components/logout-button';
import type { CurrentUser } from '@/lib/auth/current-user';
import type { Role, SpecialistType } from '@/lib/types/db';

import { SidebarNav, type SidebarCounts } from './sidebar-nav';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  specialist: 'Специалист',
  assistant: 'Помощник',
};

const SPECIALIST_TYPE_LABEL: Record<SpecialistType, string> = {
  lawyer: 'Адвокат',
  jurist: 'Юрист',
};

export function Sidebar({
  user,
  counts,
}: {
  user: CurrentUser;
  counts: SidebarCounts;
}) {
  const { profile } = user;
  const subtitle = profile.specialist_type
    ? SPECIALIST_TYPE_LABEL[profile.specialist_type]
    : ROLE_LABEL[profile.role];

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-surface border-r border-border">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 h-16 border-b border-border"
      >
        <span
          className="inline-flex w-7 h-7 items-center justify-center rounded-md text-primary-fg text-sm font-bold shrink-0"
          style={{ background: 'var(--grad-indigo)' }}
          aria-hidden="true"
        >
          ▲
        </span>
        <span className="font-semibold text-[15px] text-text">Юр CRM</span>
      </Link>

      <SidebarNav counts={counts} />

      <div className="mt-auto p-3 border-t border-border flex items-center gap-3">
        <Avatar name={profile.full_name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text truncate">
            {profile.full_name}
          </p>
          <p className="text-[11px] text-text-muted truncate">{subtitle}</p>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
