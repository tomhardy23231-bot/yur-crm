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
import type { Capability, EffectiveCaps } from '@/lib/types/db';

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
  /** Пункт виден, если у пользователя есть хотя бы одно из этих прав. */
  requiredCaps?: ReadonlyArray<Capability>;
  /** Якорь для гайд-тура (data-tour). */
  tourId?: string;
};

// Рабочая область — основные разделы (видны всем активным сотрудникам).
const WORK_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/',          label: 'Главная',    icon: LayoutDashboard, enabled: true, tourId: 'nav-home'     },
  { href: '/clients',   label: 'Клиенты',    icon: Users,           enabled: true, tourId: 'nav-clients'  },
  { href: '/cases',     label: 'Дела',       icon: Briefcase,       enabled: true, tourId: 'nav-cases'    },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare,     enabled: true, counterKey: 'tasksOpen', tourId: 'nav-tasks' },
  { href: '/calendar',  label: 'Календарь',  icon: Calendar,        enabled: true, tourId: 'nav-calendar' },
  { href: '/reports/payroll', label: 'Финансы и ЗП', icon: Coins,   enabled: true, tourId: 'nav-payroll'  },
  { href: '/documents', label: 'Документы',  icon: FileText,        enabled: false },
  { href: '/finance',   label: 'Счета',      icon: Wallet,          enabled: false },
];

// Администрирование. Единый вход — «Настройки». Пункт виден обладателям права
// управления пользователями ИЛИ системных настроек (ставок). Внутри хаба каждая
// карточка дополнительно гейтится своим правом; RLS дублирует на стороне БД.
const ADMIN_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: '/settings',
    label: 'Настройки',
    icon: Settings,
    enabled: true,
    requiredCaps: ['manage_users', 'edit_payroll_rates'],
    tourId: 'nav-settings',
  },
];

// «Справка» — отдельный служебный пункт внизу (вне групп). Виден всем.
const HELP_ITEM: NavItem = {
  href: '/help',
  label: 'Справка',
  icon: HelpCircle,
  enabled: true,
  tourId: 'nav-help',
};

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-text-disabled">
      {children}
    </div>
  );
}

export function SidebarNav({
  counts,
  caps,
  collapsed = false,
}: {
  counts: SidebarCounts;
  caps: EffectiveCaps;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  const renderItem = ({ href, label, icon: Icon, enabled, counterKey, tourId }: NavItem) => {
    const counter = counterKey ? counts[counterKey] : 0;

    if (!enabled) {
      return (
        <span
          key={href}
          title={collapsed ? `${label} — скоро` : undefined}
          className={cn(
            'flex items-center h-10 rounded-[10px] text-[14px] text-sidebar-text-disabled cursor-not-allowed select-none',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
          aria-disabled="true"
        >
          <Icon size={19} strokeWidth={1.7} />
          {!collapsed && (
            <>
              <span className="flex-1">{label}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] font-semibold">
                скоро
              </span>
            </>
          )}
        </span>
      );
    }

    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

    return (
      <Link
        key={href}
        href={href}
        data-tour={tourId}
        title={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center h-10 rounded-[10px] text-[14px] font-medium',
          'transition-colors duration-[160ms] ease-out',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
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
        <span className="relative inline-flex">
          <Icon size={19} strokeWidth={1.7} />
          {/* В свёрнутом виде число не помещается → показываем точку-индикатор. */}
          {collapsed && counter > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-sidebar-accent"
            />
          )}
        </span>
        {!collapsed && (
          <>
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
          </>
        )}
      </Link>
    );
  };

  const adminItems = ADMIN_ITEMS.filter(
    (item) => !item.requiredCaps || item.requiredCaps.some((c) => caps[c]),
  );

  return (
    <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
      {collapsed ? <div className="h-3" /> : <GroupLabel>Рабочая область</GroupLabel>}
      {WORK_ITEMS.map(renderItem)}
      {adminItems.length > 0 && (
        <>
          {collapsed ? (
            <div className="mx-auto my-2 h-px w-7 bg-sidebar-border" aria-hidden="true" />
          ) : (
            <GroupLabel>Администрирование</GroupLabel>
          )}
          {adminItems.map(renderItem)}
        </>
      )}

      {/* «Справка» — прижата к низу навигации, отделена от групп. */}
      <div className="mt-auto pt-1">
        {collapsed && (
          <div className="mx-auto mb-2 h-px w-7 bg-sidebar-border" aria-hidden="true" />
        )}
        {renderItem(HELP_ITEM)}
      </div>
    </nav>
  );
}
