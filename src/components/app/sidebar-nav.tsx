'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  Calendar,
  Clock,
  FileText,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

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
};

const ITEMS: ReadonlyArray<NavItem> = [
  { href: '/',          label: 'Главная',    icon: LayoutDashboard, enabled: true  },
  { href: '/clients',   label: 'Клиенты',    icon: Users,           enabled: true  },
  { href: '/cases',     label: 'Дела',       icon: Briefcase,       enabled: true  },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare,     enabled: true, counterKey: 'tasksOpen' },
  { href: '/calendar',  label: 'Календарь',  icon: Calendar,        enabled: true  },
  { href: '/time',      label: 'Моё время',  icon: Clock,           enabled: true  },
  { href: '/documents', label: 'Документы',  icon: FileText,        enabled: false },
  { href: '/finance',   label: 'Финансы',    icon: Wallet,          enabled: false },
];

export function SidebarNav({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon, enabled, counterKey }) => {
        if (!enabled) {
          return (
            <span
              key={href}
              className="flex items-center gap-3 px-3 h-9 rounded-md text-[13.5px] text-text-subtle cursor-not-allowed select-none"
              aria-disabled="true"
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] font-semibold opacity-70">
                скоро
              </span>
            </span>
          );
        }

        const active =
          href === '/' ? pathname === '/' : pathname.startsWith(href);

        const counter = counterKey ? counts[counterKey] : 0;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 h-9 rounded-md text-[13.5px] font-medium',
              'transition-colors duration-[80ms] ease-out',
              active
                ? 'bg-primary-subtle text-primary'
                : 'text-text-muted hover:bg-surface-muted hover:text-text',
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            {counter > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-mono font-semibold',
                  active
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface-muted text-text-muted',
                )}
              >
                {counter}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
