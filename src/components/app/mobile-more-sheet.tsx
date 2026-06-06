'use client';

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  ChevronRight,
  Coins,
  HelpCircle,
  LogOut,
  Settings,
  type LucideIcon,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { LanguageSwitcher } from '@/components/account/language-switcher';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import type { EffectiveCaps } from '@/lib/types/db';

// Мобильная «шторка» вкладки «Ещё»: выезжает снизу, держит второстепенную
// навигацию (Календарь · Финансы · Настройки · Справка), профиль, язык и выход.
// Делает мобильную навигацию полной, не раздувая нижнюю панель до 8 иконок.

type SheetItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  label: string;
};

export function MobileMoreSheet({
  open,
  onClose,
  caps,
  userName,
  roleLabel,
}: {
  open: boolean;
  onClose: () => void;
  caps: EffectiveCaps;
  userName: string;
  roleLabel: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname();

  // Esc + блокировка скролла фона, пока шторка открыта.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, handleKey]);

  if (!open || typeof document === 'undefined') return null;

  const canAdmin = caps.manage_users || caps.edit_payroll_rates;

  const items: SheetItem[] = [
    { id: 'calendar', href: '/calendar', icon: Calendar, label: t.nav.calendar },
    { id: 'payroll', href: '/reports/payroll', icon: Coins, label: t.nav.payroll },
    ...(canAdmin
      ? [{ id: 'settings', href: '/settings', icon: Settings, label: t.nav.settings }]
      : []),
    { id: 'help', href: '/help', icon: HelpCircle, label: t.nav.help },
  ];

  const profileActive = pathname.startsWith('/profile');

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t.nav.moreSheetTitle}
    >
      {/* Подложка */}
      <button
        type="button"
        aria-label={t.nav.moreSheetTitle}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#0B1020]/55 backdrop-blur-[3px] animate-sheet-fade"
      />

      {/* Лист */}
      <div
        className={cn(
          'relative z-10 max-h-[85dvh] overflow-y-auto rounded-t-[22px]',
          'border-t border-border bg-surface shadow-[var(--shadow-pop)]',
          'animate-sheet-up',
        )}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
      >
        {/* Хват-полоска */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
        </div>

        {/* Профиль */}
        <div className="px-4 pt-2">
          <Link
            href="/profile"
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
              profileActive
                ? 'border-primary-border bg-primary-subtle'
                : 'border-border bg-surface-muted/50 active:bg-surface-muted',
            )}
          >
            <Avatar name={userName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-text">{userName}</p>
              <p className="truncate text-[12.5px] text-text-muted">{roleLabel}</p>
            </div>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className={profileActive ? 'text-primary' : 'text-text-subtle'}
            />
          </Link>
        </div>

        {/* Второстепенная навигация — плитки 2×N */}
        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          {items.map(({ id, href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={id}
                href={href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 transition-colors',
                  active
                    ? 'border-primary-border bg-primary-subtle text-primary'
                    : 'border-border bg-surface text-text active:bg-surface-muted',
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={1.85}
                  className={active ? 'text-primary' : 'text-text-muted'}
                />
                <span className="text-[13.5px] font-semibold leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Язык интерфейса */}
        <div className="px-4 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
            {t.account.language.label}
          </p>
          <LanguageSwitcher />
        </div>

        {/* Выход */}
        <div className="px-4 pt-4">
          <form action="/logout" method="post">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[14px] font-semibold text-error transition-colors active:bg-error-bg"
            >
              <LogOut size={17} strokeWidth={1.85} />
              {t.auth.logout}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
