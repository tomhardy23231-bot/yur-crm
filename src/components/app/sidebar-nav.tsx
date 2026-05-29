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
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types/db';

export type SidebarCounts = {
  tasksOpen: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  /** Ключ счётчика из counts. */
  counterKey?: keyof SidebarCounts;
  /** Пункт виден только владельцу (системные настройки). */
  ownerOnly?: boolean;
};

// Рабочая область — основные разделы (видны всем активным сотрудникам).
const WORK_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/',          label: 'Главная',    icon: LayoutDashboard, enabled: true  },
  { href: '/clients',   label: 'Клиенты',    icon: Users,           enabled: true  },
  { href: '/cases',     label: 'Дела',       icon: Briefcase,       enabled: true  },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare,     enabled: true, counterKey: 'tasksOpen' },
  { href: '/calendar',  label: 'Календарь',  icon: Calendar,        enabled: true  },
  { href: '/reports/payroll', label: 'Финансы и ЗП', icon: Coins,   enabled: true  },
  { href: '/documents', label: 'Документы',  icon: FileText,        enabled: false },
  { href: '/finance',   label: 'Счета',      icon: Wallet,          enabled: false },
];

// Администрирование — системные настройки (только владелец).
const ADMIN_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/settings',  label: 'Настройки',  icon: Settings,        enabled: true, ownerOnly: true },
];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-text-disabled">
      {children}
    </div>
  );
}

export function SidebarNav({
  counts,
  role,
}: {
  counts: SidebarCounts;
  role: Role;
}) {
  const pathname = usePathname();

  const renderItem = ({ href, label, icon: Icon, enabled, counterKey }: NavItem) => {
    if (!enabled) {
      return (
        <span
          key={href}
          className="flex items-center gap-3 px-3 h-10 rounded-[10px] text-[14px] text-sidebar-text-disabled cursor-not-allowed select-none"
          aria-disabled="true"
        >
          <Icon size={19} strokeWidth={1.7} />
          <span className="flex-1">{label}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] font-semibold">
            скоро
          </span>
        </span>
      );
    }

    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    const counter = counterKey ? counts[counterKey] : 0;

    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-3 px-3 h-10 rounded-[10px] text-[14px] font-medium',
          'transition-colors duration-[160ms] ease-out',
          active
            ? 'bg-sidebar-active-bg text-sidebar-active-text'
            : 'text-sidebar-text hover:bg-sidebar-hover-bg hover:text-sidebar-text-strong',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-[3px] bg-sidebar-accent"
          />
        )}
        <Icon size={19} strokeWidth={1.7} />
        <span className="flex-1">{label}</span>
        {counter > 0 && (
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-mono font-semibold',
              active
                ? 'bg-sidebar-accent/20 text-sidebar-accent-bright'
                : 'bg-white/[0.07] text-sidebar-text',
            )}
          >
            {counter}
          </span>
        )}
      </Link>
    );
  };

  const adminItems = ADMIN_ITEMS.filter(
    (item) => !item.ownerOnly || role === 'owner',
  );

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
      <GroupLabel>Рабочая область</GroupLabel>
      {WORK_ITEMS.map(renderItem)}
      {adminItems.length > 0 && (
        <>
          <GroupLabel>Администрирование</GroupLabel>
          {adminItems.map(renderItem)}
        </>
      )}
    </nav>
  );
}
