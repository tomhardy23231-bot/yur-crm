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
import { cn } from '@/lib/utils';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import {
  CLIENTS_DEFAULT_SORT,
  CLIENTS_PAGE_SIZE,
  CLIENTS_SORTABLE_COLUMNS,
  type ClientsSortColumn,
  listClients,
} from '@/lib/clients/queries';
import { CLIENT_KIND_LABEL, type ClientKind } from '@/lib/types/db';

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

  const result = await listClients({ q, kind, page, sort, dir });
  const { items, pageCount } = result;

  const KIND_OPTIONS: ReadonlyArray<{ value: ClientKind | 'all'; label: string }> = [
    { value: 'all', label: 'Все' },
    { value: 'individual', label: CLIENT_KIND_LABEL.individual },
    { value: 'company', label: CLIENT_KIND_LABEL.company },
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
          Клиент удалён.
        </div>
      )}

      <div data-tour="clients-toolbar" className="flex flex-wrap items-center gap-3">
        <ClientsSearch initial={q} />
        <div role="tablist" aria-label="Тип клиента" className="flex items-center gap-1.5">
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
        <Button asChild className="ml-auto">
          <Link href="/clients/new" data-tour="clients-new">
            <Plus size={16} strokeWidth={2} />
            Добавить клиента
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState hasFilters={Boolean(q || kind)} />
      ) : (
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <SortableHeader
                  column="name"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  Клиент
                </SortableHeader>
                <TableHead>Тип</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="text-right">Дел</TableHead>
                <SortableHeader
                  column="created_at"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  Создан
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
                      className="relative flex items-center gap-3 -my-1 -mx-2 px-2 py-1 rounded-md transition-transform duration-200 ease-out group-hover:translate-x-1 focus-visible:outline-none focus-visible:bg-primary-subtle"
                    >
                      <Avatar name={c.name} size="sm" />
                      <span className="font-medium text-text group-hover:text-primary transition-colors">
                        {c.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ClientKindBadge kind={c.client_kind} />
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] text-text-muted">
                    {c.phone ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] text-text-muted">
                    {c.email ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.cases_count}</TableCell>
                  <TableCell className="font-mono text-[12.5px] text-text-muted">
                    {DATE_FMT.format(new Date(c.created_at))}
                  </TableCell>
                </ClickableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label="Пагинация">
          <p className="text-[12px] text-text-muted">
            Страница {page} из {pageCount} · по {CLIENTS_PAGE_SIZE} на странице
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
              ← Назад
            </PageLink>
            <PageLink href={pageHref(page + 1)} disabled={page >= pageCount}>
              Вперёд →
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <UsersIcon size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">
        {hasFilters ? 'Ничего не нашли' : 'Здесь будут ваши клиенты'}
      </h2>
      <p className="text-[13px] text-text-muted max-w-md mb-5">
        {hasFilters
          ? 'Попробуйте изменить поиск или фильтры. Если клиент должен быть видим — проверьте, что у вас есть связанное с ним дело.'
          : 'Заведите первого клиента — затем добавите ему дело, документы и финансы.'}
      </p>
      {!hasFilters && (
        <Button asChild>
          <Link href="/clients/new">
            <Plus size={16} strokeWidth={2} />
            Добавить клиента
          </Link>
        </Button>
      )}
    </div>
  );
}
