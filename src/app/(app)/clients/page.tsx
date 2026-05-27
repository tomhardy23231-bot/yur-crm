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
import { ClientKindBadge } from '@/components/clients/client-kind-badge';
import { ClientsSearch } from '@/components/clients/clients-search';
import { cn } from '@/lib/utils';
import { listClients, CLIENTS_PAGE_SIZE } from '@/lib/clients/queries';
import { CLIENT_KIND_LABEL, type ClientKind } from '@/lib/types/db';

function isClientKind(value: string): value is ClientKind {
  return value === 'individual' || value === 'company';
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const kind = sp.kind && isClientKind(sp.kind) ? sp.kind : undefined;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;
  const deleted = sp.deleted === '1';

  const result = await listClients({ q, kind, page });
  const { items, total, pageCount } = result;

  const KIND_OPTIONS: ReadonlyArray<{ value: ClientKind | 'all'; label: string }> = [
    { value: 'all', label: 'Все' },
    { value: 'individual', label: CLIENT_KIND_LABEL.individual },
    { value: 'company', label: CLIENT_KIND_LABEL.company },
  ];

  function pillHref(next: ClientKind | 'all'): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (next !== 'all') params.set('kind', next);
    const s = params.toString();
    return s ? `/clients?${s}` : '/clients';
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `/clients?${s}` : '/clients';
  }

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Клиенты
          </h1>
          <p className="text-[13px] text-text-muted">
            {total === 0
              ? 'Пока нет клиентов'
              : `Всего: ${total} ${plural(total, ['клиент', 'клиента', 'клиентов'])}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/clients/new">
            <Plus size={16} strokeWidth={2} />
            Добавить клиента
          </Link>
        </Button>
      </header>

      {deleted && (
        <div className="text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2 max-w-md">
          Клиент удалён.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {items.length === 0 ? (
        <EmptyState hasFilters={Boolean(q || kind)} />
      ) : (
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead>Клиент</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="text-right">Дел</TableHead>
                <TableHead>Создан</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="group cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/clients/${c.id}`}
                      className="flex items-center gap-3 -my-1 -mx-2 px-2 py-1 rounded-md focus-visible:outline-none focus-visible:bg-primary-subtle"
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
                </TableRow>
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

// Простой плюрализатор для русских числительных.
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
