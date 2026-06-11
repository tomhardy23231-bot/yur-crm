import Link from 'next/link';
import { ExternalLink, Pencil, Plus, Users as UsersIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CardListShell,
  CardHead,
  CardSortHead,
  RowAction,
} from '@/components/ui/card-table';
import { Avatar } from '@/components/ui/avatar';
import { ClickableCard } from '@/components/ui/clickable-card';
import { ClientKindBadge } from '@/components/clients/client-kind-badge';
import { ClientsSearch } from '@/components/clients/clients-search';
import { ClientListMobile } from '@/components/clients/client-list-mobile';
import { cn } from '@/lib/utils';
import { type SortDir } from '@/components/ui/sortable-header';
import { requireUser } from '@/lib/auth/require-role';
import {
  CLIENTS_DEFAULT_SORT,
  CLIENTS_PAGE_SIZE,
  CLIENTS_SORTABLE_COLUMNS,
  type ClientsSortColumn,
  listClients,
} from '@/lib/clients/queries';
import { CLIENT_KINDS, STAFF_ROLES, type ClientKind } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';

// Колонки «карточек-строк» десктоп-списка клиентов (общие для шапки и строк):
// клиент · тип · телефон · e-mail · дел · создан · действия.
const CLIENTS_COLS =
  'minmax(220px,2fr) 150px minmax(150px,1fr) minmax(180px,1.4fr) 110px 130px 96px';

function isClientKind(value: string): value is ClientKind {
  return (CLIENT_KINDS as readonly string[]).includes(value);
}
function isClientsSortColumn(value: string): value is ClientsSortColumn {
  return (CLIENTS_SORTABLE_COLUMNS as readonly string[]).includes(value);
}
function isSortDir(value: string): value is SortDir {
  return value === 'asc' || value === 'desc';
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    page?: string;
    deleted?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const kind = sp.kind && isClientKind(sp.kind) ? sp.kind : undefined;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;
  const deleted = sp.deleted === '1';
  const sort: ClientsSortColumn =
    sp.sort && isClientsSortColumn(sp.sort) ? sp.sort : CLIENTS_DEFAULT_SORT.sort;
  const dir: SortDir =
    sp.dir && isSortDir(sp.dir) ? sp.dir : CLIENTS_DEFAULT_SORT.dir;

  const { t, fmt } = await getT();
  const user = await requireUser();
  // Иконку «редактировать» в строке показываем только staff (они правят любого
  // клиента). Остальные правят с карточки клиента — там работает та же проверка.
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  const result = await listClients({ q, kind, page, sort, dir });
  const { items, pageCount } = result;

  const KIND_OPTIONS: ReadonlyArray<{ value: ClientKind | 'all'; label: string }> = [
    { value: 'all', label: t.common.all },
    ...CLIENT_KINDS.map((k) => ({ value: k, label: t.enums.clientKind[k] })),
  ];

  function pillHref(next: ClientKind | 'all'): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (next !== 'all') params.set('kind', next);
    if (sort !== CLIENTS_DEFAULT_SORT.sort || dir !== CLIENTS_DEFAULT_SORT.dir) {
      params.set('sort', sort);
      params.set('dir', dir);
    }
    const s = params.toString();
    return s ? `/clients?${s}` : '/clients';
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    if (p > 1) params.set('page', String(p));
    if (sort !== CLIENTS_DEFAULT_SORT.sort || dir !== CLIENTS_DEFAULT_SORT.dir) {
      params.set('sort', sort);
      params.set('dir', dir);
    }
    const s = params.toString();
    return s ? `/clients?${s}` : '/clients';
  }

  function sortHref(nextSort: string, nextDir: SortDir): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    if (nextSort !== CLIENTS_DEFAULT_SORT.sort || nextDir !== CLIENTS_DEFAULT_SORT.dir) {
      params.set('sort', nextSort);
      params.set('dir', nextDir);
    }
    const s = params.toString();
    return s ? `/clients?${s}` : '/clients';
  }

  return (
    <main className="flex flex-col gap-3 px-3 py-2 sm:px-4">
      {deleted && (
        <div className="text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2 max-w-md">
          {t.clients.list.deletedNotice}
        </div>
      )}

      <div data-tour="clients-toolbar" className="flex flex-col gap-3">
        {/* Ряд 1: поиск + добавить (подпись кнопки прячется на мобильных). */}
        <div className="flex items-center gap-2">
          <ClientsSearch initial={q} />
          <Button asChild className="shrink-0 px-3 sm:px-4">
            <Link href="/clients/new" data-tour="clients-new">
              <Plus size={16} strokeWidth={2} />
              <span className="hidden sm:inline">{t.clients.list.addClient}</span>
            </Link>
          </Button>
        </div>

        {/* Ряд 2: фильтр по типу клиента. */}
        <div
          role="tablist"
          aria-label={t.clients.list.kindFilterLabel}
          className="flex flex-wrap items-center gap-1.5"
        >
          {KIND_OPTIONS.map(({ value, label }) => {
            const active = (value === 'all' && !kind) || value === kind;
            return (
              <Link
                key={value}
                href={pillHref(value)}
                role="tab"
                aria-selected={active}
                className={cn(
                  'inline-flex items-center px-3 h-9 rounded-md text-[13px] font-medium',
                  'border transition-colors duration-[80ms] ease-out',
                  active
                    ? 'bg-primary-subtle text-primary border-primary-border'
                    : 'bg-surface text-text-muted border-border hover:text-text hover:border-border-strong',
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-8 shadow-sm">
          <EmptyState
            icon={UsersIcon}
            title={
              q || kind
                ? t.clients.list.emptyFilteredTitle
                : t.clients.list.emptyTitle
            }
            hint={
              q || kind ? t.clients.list.emptyFilteredHint : t.clients.list.emptyHint
            }
            action={
              !(q || kind) ? (
                <Button asChild>
                  <Link href="/clients/new">
                    <Plus size={16} strokeWidth={2} />
                    {t.clients.list.addClient}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
        {/* Мобильное представление — карточки вместо таблицы. */}
        <ClientListMobile items={items} />

        {/* Десктоп (≥ md) — «карточки-строки»: каждый клиент отдельной карточкой. */}
        <CardListShell
          cols={CLIENTS_COLS}
          minWidth={1120}
          ariaLabel={t.clients.list.tableAria}
          header={
            <>
              <CardSortHead column="name" currentSort={sort} currentDir={dir} hrefFor={sortHref}>
                {t.clients.list.colClient}
              </CardSortHead>
              <CardHead>{t.clients.list.colKind}</CardHead>
              <CardHead>{t.clients.list.colPhone}</CardHead>
              <CardHead>{t.clients.list.colEmail}</CardHead>
              <CardHead align="right">{t.clients.list.colCases}</CardHead>
              <CardSortHead column="created_at" currentSort={sort} currentDir={dir} hrefFor={sortHref}>
                {t.clients.list.colCreated}
              </CardSortHead>
              <CardHead align="right">{t.clients.list.colActions}</CardHead>
            </>
          }
        >
          {items.map((c) => (
            <ClickableCard key={c.id} href={`/clients/${c.id}`} cols={CLIENTS_COLS}>
              {/* Клиент: аватар + имя */}
              <div role="cell" className="min-w-0">
                <Link
                  href={`/clients/${c.id}`}
                  className="flex min-w-0 items-center gap-2.5 transition-colors focus-visible:outline-none"
                >
                  <Avatar name={c.name} size="sm" shape="square" />
                  <span className="truncate font-semibold text-text group-hover:text-primary">
                    {c.name}
                  </span>
                </Link>
              </div>

              {/* Тип */}
              <div role="cell" className="min-w-0">
                <ClientKindBadge kind={c.client_kind} />
              </div>

              {/* Телефон */}
              <div role="cell" className="truncate text-[12.5px] text-text-muted">
                {c.phone ?? t.common.dash}
              </div>

              {/* E-mail */}
              <div role="cell" className="truncate text-[12.5px] text-text-muted">
                {c.email ?? t.common.dash}
              </div>

              {/* Дел */}
              <div role="cell" className="text-right tabular-nums">
                {c.cases_count}
              </div>

              {/* Создан */}
              <div role="cell" className="text-[12.5px] tabular-nums text-text-muted">
                {DATE_FMT.format(new Date(c.created_at))}
              </div>

              {/* Действия: открыть · редактировать (последнее — staff) */}
              <div role="cell" className="flex items-center justify-end gap-1">
                <RowAction
                  href={`/clients/${c.id}`}
                  external
                  label={t.clients.list.actionOpen}
                  icon={<ExternalLink size={15} strokeWidth={1.75} />}
                />
                {isStaff && (
                  <RowAction
                    href={`/clients/${c.id}/edit`}
                    label={t.clients.list.actionEdit}
                    icon={<Pencil size={15} strokeWidth={1.75} />}
                  />
                )}
              </div>
            </ClickableCard>
          ))}
        </CardListShell>
        </>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label={t.clients.list.paginationLabel}>
          <p className="text-[12px] text-text-muted">
            {fmt(t.clients.list.pageInfo, {
              page,
              pageCount,
              pageSize: CLIENTS_PAGE_SIZE,
            })}
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
              {t.clients.list.prev}
            </PageLink>
            <PageLink href={pageHref(page + 1)} disabled={page >= pageCount}>
              {t.clients.list.next}
            </PageLink>
          </div>
        </nav>
      )}
    </main>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text-subtle bg-surface border border-border rounded-md cursor-not-allowed"
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-surface-muted transition-colors"
    >
      {children}
    </Link>
  );
}

