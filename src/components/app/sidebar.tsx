import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { LogoutButton } from '@/components/logout-button';
import { getT } from '@/lib/i18n/server';
import type { EffectiveCaps } from '@/lib/types/db';

import { SidebarNav, type SidebarCounts } from './sidebar-nav';

// Иконочный рейл ~90px (бриф §6) — заменяет широкий сайдбар. Тёмный navy-градиент,
// бренд-марка сверху, пункты «иконка + микро-подпись» по центру, внизу — аватар
// пользователя и выход. Фиксированная ширина (без сворачивания).
export async function Sidebar({
  userName,
  roleLabel,
  caps,
  counts,
}: {
  userName: string;
  roleLabel: string;
  caps: EffectiveCaps;
  counts: SidebarCounts;
}) {
  const { t } = await getT();
  return (
    <aside
      className="app-sidebar hidden h-full w-[90px] shrink-0 flex-col items-center overflow-hidden border-r border-sidebar-border md:flex"
      style={{ background: 'var(--sidebar-bg-gradient)' }}
    >
      {/* Бренд-марка «Ю» */}
      <div className="flex h-16 shrink-0 items-center justify-center">
        <Link
          href="/"
          aria-label={t.nav.brandHomeAria}
          title={t.nav.brandTitle}
          className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[19px] font-bold leading-none"
          style={{
            background: 'var(--grad-brand)',
            color: 'var(--brand-tile-fg)',
            boxShadow: 'var(--shadow-brand-tile)',
          }}
        >
          Ю
        </Link>
      </div>

      <SidebarNav counts={counts} caps={caps} />

      {/* Низ: аватар пользователя + выход */}
      <div className="flex w-full shrink-0 flex-col items-center gap-2 border-t border-sidebar-border py-3">
        <Link href="/profile" title={`${userName} · ${roleLabel}`} aria-label={t.nav.profileAria}>
          <Avatar name={userName} size="md" />
        </Link>
        <LogoutButton label={t.auth.logout} />
      </div>
    </aside>
  );
}
