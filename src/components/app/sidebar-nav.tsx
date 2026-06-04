'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  Calendar,
  Coins,
  FileText,
  Wallet,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Capability, EffectiveCaps } from '@/lib/types/db';

export type SidebarCounts = {
  tasksOpen: number;
};

// Ключ пункта = база в словаре nav: t.nav[key] (полное) + t.nav[`${key}Short`].
type NavId =
  | 'home'
  | 'clients'
  | 'cases'
  | 'tasks'
  | 'calendar'
  | 'payroll'
  | 'documents'
  | 'finance'
  | 'settings'
  | 'help';

type NavItem = {
  id: NavId;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
  /** Ключ счётчика из counts. */
  counterKey?: keyof SidebarCounts;
  /** Пункт виден, если у пользователя есть хотя бы одно из этих прав. */
  requiredCaps?: ReadonlyArray<Capability>;
  /** Якорь для гайд-тура (data-tour). */
  tourId?: string;
};

// Рабочая область — основные разделы (видны всем активным сотрудникам).
const WORK_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'home',      href: '/',          icon: LayoutDashboard, enabled: true, tourId: 'nav-home'     },
  { id: 'clients',   href: '/clients',   icon: Users,           enabled: true, tourId: 'nav-clients'  },
  { id: 'cases',     href: '/cases',     icon: Briefcase,       enabled: true, tourId: 'nav-cases'    },
  { id: 'tasks',     href: '/tasks',     icon: CheckSquare,     enabled: true, counterKey: 'tasksOpen', tourId: 'nav-tasks' },
  { id: 'calendar',  href: '/calendar',  icon: Calendar,        enabled: true, tourId: 'nav-calendar' },
  { id: 'payroll',   href: '/reports/payroll', icon: Coins,     enabled: true, tourId: 'nav-payroll'  },
  { id: 'documents', href: '/documents', icon: FileText,        enabled: false },
  { id: 'finance',   href: '/finance',   icon: Wallet,          enabled: false },
];

// Администрирование. Единый вход — «Настройки». Виден обладателям права
// управления пользователями ИЛИ системных настроек (ставок). RLS дублирует.
const ADMIN_ITEMS: ReadonlyArray<NavItem> = [
  {
    id: 'settings',
    href: '/settings',
    icon: Settings,
    enabled: true,
    requiredCaps: ['manage_users', 'edit_payroll_rates'],
    tourId: 'nav-settings',
  },
];

// «Справка» — служебный пункт, прижат к низу рейла.
const HELP_ITEM: NavItem = {
  id: 'help',
  href: '/help',
  icon: HelpCircle,
  enabled: true,
  tourId: 'nav-help',
};

// Иконочный рейл (бриф §6): каждый пункт — «иконка + микро-подпись», активный
// подсвечен синим + синяя полоска слева, при наведении фон чуть светлее.
// Полное название — в тултипе (title); у скоро-разделов — «… — скоро».
export function SidebarNav({
  counts,
  caps,
}: {
  counts: SidebarCounts;
  caps: EffectiveCaps;
}) {
  const pathname = usePathname();
  const { t, fmt } = useI18n();

  const renderItem = ({ id, href, icon: Icon, enabled, counterKey, tourId }: NavItem) => {
    const counter = counterKey ? counts[counterKey] : 0;
    const label = t.nav[id];
    const short = t.nav[`${id}Short`];

    if (!enabled) {
      return (
        <span
          key={href}
          title={fmt(t.nav.comingSoonTooltip, { label })}
          aria-disabled="true"
          className="group relative flex w-[72px] cursor-default select-none flex-col items-center gap-1.5 rounded-[12px] py-2.5 text-sidebar-text-disabled"
        >
          <span
            aria-hidden="true"
            className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-sidebar-text-disabled"
          />
          <Icon size={21} strokeWidth={1.7} className="opacity-80" />
          <span className="text-[9.5px] font-semibold leading-none tracking-[0.01em]">{short}</span>
        </span>
      );
    }

    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

    return (
      <Link
        key={href}
        href={href}
        data-tour={tourId}
        title={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex w-[72px] flex-col items-center gap-1.5 rounded-[12px] py-2.5',
          'transition-colors duration-[150ms] ease-out',
          active
            ? 'bg-sidebar-active-bg text-sidebar-active-text'
            : 'text-sidebar-text hover:bg-sidebar-elevated hover:text-sidebar-text-strong',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute -left-[9px] top-[11px] bottom-[11px] w-[3px] rounded-r-[3px] bg-sidebar-accent"
          />
        )}
        <span className="relative inline-flex">
          <Icon
            size={21}
            strokeWidth={1.7}
            className={active ? 'text-sidebar-accent-bright' : 'opacity-85'}
          />
          {counter > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-1.5 h-2 w-2 rounded-full bg-sidebar-accent ring-2 ring-[color:var(--sidebar-bg)]"
            />
          )}
        </span>
        <span className="text-[9.5px] font-semibold leading-none tracking-[0.01em]">{short}</span>
      </Link>
    );
  };

  const adminItems = ADMIN_ITEMS.filter(
    (item) => !item.requiredCaps || item.requiredCaps.some((c) => caps[c]),
  );

  return (
    <nav className="flex flex-1 flex-col items-center gap-[3px] overflow-x-hidden overflow-y-auto px-0 py-1">
      {WORK_ITEMS.map(renderItem)}
      {adminItems.length > 0 && (
        <>
          <div className="my-1.5 h-px w-7 bg-sidebar-border" aria-hidden="true" />
          {adminItems.map(renderItem)}
        </>
      )}

      {/* «Справка» — прижата к низу навигации. */}
      <div className="mt-auto pt-1">
        <div className="mx-auto mb-1.5 h-px w-7 bg-sidebar-border" aria-hidden="true" />
        {renderItem(HELP_ITEM)}
      </div>
    </nav>
  );
}
