'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Coins,
  FileSpreadsheet,
  Languages,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Messages } from '@/lib/i18n/messages';

// Идентификатор раздела настроек. Совпадает с ключом карточки в словаре, чтобы
// подпись раздела брать напрямую из t.settings.<id>Card.title (не дублируем).
export type SettingsNavId =
  | 'users'
  | 'departments'
  | 'caseTypes'
  | 'rates'
  | 'requisites'
  | 'language';

type SettingsGroupId = 'team' | 'casesFinance' | 'company' | 'personal';

type SettingsNavItem = {
  id: SettingsNavId;
  href: string;
  icon: LucideIcon;
  group: SettingsGroupId;
};

// Порядок здесь = порядок в рейле (сгруппировано). Гейтинг решает layout —
// сюда прилетает только список видимых id (visibleIds).
const ITEMS: ReadonlyArray<SettingsNavItem> = [
  { id: 'users',       href: '/settings/users',       icon: Users,           group: 'team' },
  { id: 'departments', href: '/settings/departments', icon: Building2,        group: 'team' },
  { id: 'caseTypes',   href: '/settings/case-types',  icon: Tags,            group: 'casesFinance' },
  { id: 'rates',       href: '/settings/payroll',     icon: Coins,           group: 'casesFinance' },
  { id: 'requisites',  href: '/settings/requisites',  icon: FileSpreadsheet, group: 'company' },
  { id: 'language',    href: '/profile',              icon: Languages,       group: 'personal' },
];

const GROUP_ORDER: ReadonlyArray<SettingsGroupId> = [
  'team',
  'casesFinance',
  'company',
  'personal',
];

// Подпись раздела = заголовок его карточки в словаре настроек.
function itemLabel(id: SettingsNavId, s: Messages['settings']): string {
  switch (id) {
    case 'users':
      return s.usersCard.title;
    case 'departments':
      return s.departmentsCard.title;
    case 'caseTypes':
      return s.caseTypesCard.title;
    case 'rates':
      return s.ratesCard.title;
    case 'requisites':
      return s.requisitesCard.title;
    case 'language':
      return s.languageCard.title;
  }
}

// Левый рейл настроек (desktop) + горизонтальная лента (mobile).
// Активный пункт — по текущему пути; вложенные маршруты (например
// /settings/users/[id]) тоже подсвечивают свой раздел.
export function SettingsNav({
  visibleIds,
  variant,
}: {
  visibleIds: ReadonlyArray<SettingsNavId>;
  variant: 'rail' | 'strip';
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  const visible = new Set(visibleIds);
  const items = ITEMS.filter((i) => visible.has(i.id));

  // /profile активен только на самом профиле; /settings/* — по префиксу.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  if (variant === 'strip') {
    return (
      <nav
        aria-label={t.settings.capsHeading}
        className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4"
      >
        {items.map(({ id, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={id}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                active
                  ? 'border-primary-border bg-primary-subtle font-semibold text-primary-pressed'
                  : 'border-border bg-surface text-text-muted hover:text-text',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {itemLabel(id, t.settings)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label={t.settings.capsHeading} className="flex flex-col gap-4">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
              {t.settings.navGroups[group]}
            </p>
            {groupItems.map(({ id, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={id}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-control px-3 py-2 text-[13.5px] transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                    active
                      ? 'bg-primary-subtle font-semibold text-primary-pressed'
                      : 'text-text-muted hover:bg-surface-muted hover:text-text',
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-primary"
                    />
                  )}
                  <Icon
                    size={17}
                    strokeWidth={1.75}
                    className={active ? 'text-primary' : 'text-text-subtle'}
                  />
                  <span className="truncate">{itemLabel(id, t.settings)}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
