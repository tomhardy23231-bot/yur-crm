import Link from 'next/link';
import { Plus, Users as UsersIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Avatar } from '@/components/ui/avatar';
import { ClickableRow } from '@/components/ui/clickable-row';
import { ClientKindBadge } from '@/components/clients/client-kind-badge';
import { ClientsSearch } from '@/components/clients/clients-search';
import { ClientListMobile } from '@/components/clients/client-list-mobile';
import { cn } from '@/lib/utils';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import {
  CLIENTS_DEFAULT_SORT,
  CLIENTS_PAGE_SIZE,
  CLIENTS_SORTABLE_COLUMNS,
  type ClientsSortColumn,
  listClients,
} from '@/lib/clients/queries';
import { type ClientKind } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';
import type { I18n } from '@/lib/i18n/core';

function isClientKind(value: string): value is ClientKind {
  return value === 'individual' || value === 'company';
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
  const result = await listClients({ q, kind, page, sort, dir });
  const { items, pageCount } = result;

  const KIND_OPTIONS: ReadonlyArray<{ value: ClientKind | 'all'; label: string }> = [
    { value: 'all', label: t.common.all },
    { value: 'individual', label: t.enums.clientKind.individual },
    { value: 'company', label: t.enums.clientKind.company },
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
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
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
        <EmptyState hasFilters={Boolean(q || kind)} t={t} />
      ) : (
        <>
        {/* Мобильное представление — карточки вместо таблицы. */}
        <ClientListMobile items={items} />

        {/* Таблица — на ≥ md. */}
        <div className="hidden bg-surface rounded-lg border border-border shadow-sm overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <SortableHeader
                  column="name"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  {t.clients.list.colClient}
                </SortableHeader>
                <TableHead>{t.clients.list.colKind}</TableHead>
                <TableHead>{t.clients.list.colPhone}</TableHead>
                <TableHead>{t.clients.list.colEmail}</TableHead>
                <TableHead className="text-right">{t.clients.list.colCases}</TableHead>
                <SortableHeader
                  column="created_at"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  {t.clients.list.colCreated}
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <ClickableRow
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="group cursor-pointer"
                >
                  <TableCell className="relative">
                    {/* Латунная полоска слева — заполняется из центра при наведении на строку */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-l-lg [box-shadow:inset_3px_0_0_var(--primary)] [clip-path:inset(50%_0)] transition-[clip-path] duration-[400ms] ease-out group-hover:[clip-path:inset(0)]"
                    />
                    <Link
                      href={`/clients/${c.id}`}
                      className="relative -mx-2 -my-1 flex items-center gap-3 rounded-md px-2 py-1 transition-transform duration-200 ease-out group-hover:translate-x-1 focus-visible:bg-primary-subtle focus-visible:outline-none"
                    >
                      <Avatar name={c.name} size="sm" shape="square" />
                      <span className="font-semibold text-text transition-colors group-hover:text-primary">
                        {c.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ClientKindBadge kind={c.client_kind} />
                  </TableCell>
                  <TableCell className="text-[12.5px] text-text-muted">
                    {c.phone ?? t.common.dash}
                  </TableCell>
                  <TableCell className="text-[12.5px] text-text-muted">
                    {c.email ?? t.common.dash}
                  </TableCell>
                  <TableCell className="text-right">{c.cases_count}</TableCell>
                  <TableCell className="text-[12.5px] text-text-muted">
                    {DATE_FMT.format(new Date(c.created_at))}
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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

function EmptyState({
  hasFilters,
  t,
}: {
  hasFilters: boolean;
  t: I18n['t'];
}) {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <UsersIcon size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">
        {hasFilters ? t.clients.list.emptyFilteredTitle : t.clients.list.emptyTitle}
      </h2>
      <p className="text-[13px] text-text-muted max-w-md mb-5">
        {hasFilters
          ? t.clients.list.emptyFilteredHint
          : t.clients.list.emptyHint}
      </p>
      {!hasFilters && (
        <Button asChild>
          <Link href="/clients/new">
            <Plus size={16} strokeWidth={2} />
            {t.clients.list.addClient}
          </Link>
        </Button>
      )}
    </div>
  );
}
