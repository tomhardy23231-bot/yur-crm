import Link from 'next/link';
import { Briefcase, Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StageBadge } from '@/components/ui/stage-badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { CasesSearch } from '@/components/cases/cases-search';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { requireUser } from '@/lib/auth/require-role';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import {
  CASES_DEFAULT_SORT,
  CASES_PAGE_SIZE,
  CASES_SORTABLE_COLUMNS,
  type CasesSortColumn,
  listCases,
  listSpecialistsForAssignment,
} from '@/lib/cases/queries';
import {
  CASE_STAGE_LABEL,
  CASE_STAGES,
  CASE_TYPE_LABEL,
  CASE_TYPES,
  type CaseStage,
  type CaseType,
} from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function isCaseStage(value: string): value is CaseStage {
  return (CASE_STAGES as readonly string[]).includes(value);
}
function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCasesSortColumn(value: string): value is CasesSortColumn {
  return (CASES_SORTABLE_COLUMNS as readonly string[]).includes(value);
}
function isSortDir(value: string): value is SortDir {
  return value === 'asc' || value === 'desc';
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    type?: string;
    responsible?: string;
    page?: string;
    deleted?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = sp.q?.trim() ?? '';
  const stage = sp.stage && isCaseStage(sp.stage) ? sp.stage : undefined;
  const caseType = sp.type && isCaseType(sp.type) ? sp.type : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;
  const deleted = sp.deleted === '1';
  const sort: CasesSortColumn =
    sp.sort && isCasesSortColumn(sp.sort) ? sp.sort : CASES_DEFAULT_SORT.sort;
  const dir: SortDir =
    sp.dir && isSortDir(sp.dir) ? sp.dir : CASES_DEFAULT_SORT.dir;

  const isStaff =
    user.profile.role === 'owner' || user.profile.role === 'admin';

  // Список ответственных для staff-фильтра (специалистам/ассистентам он не нужен:
  // они и так видят только свои дела).
  const specialists = isStaff ? await listSpecialistsForAssignment() : [];

  const result = await listCases({ q, stage, caseType, responsibleId, page, sort, dir });
  const { items, total, pageCount } = result;

  function buildHref(
    overrides: Partial<{
      q: string;
      stage: string;
      type: string;
      responsible: string;
      page: number;
      sort: string;
      dir: string;
    }>,
  ): string {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextStage = overrides.stage ?? stage ?? '';
    const nextType = overrides.type ?? caseType ?? '';
    const nextResp = overrides.responsible ?? responsibleId ?? '';
    const nextPage = overrides.page ?? page;
    const nextSort = overrides.sort ?? sort;
    const nextDir = overrides.dir ?? dir;
    if (nextQ) params.set('q', nextQ);
    if (nextStage) params.set('stage', nextStage);
    if (nextType) params.set('type', nextType);
    if (nextResp) params.set('responsible', nextResp);
    if (nextPage > 1) params.set('page', String(nextPage));
    // Не шумим в URL дефолтным sort'ом — храним только когда отличается.
    if (nextSort !== CASES_DEFAULT_SORT.sort || nextDir !== CASES_DEFAULT_SORT.dir) {
      params.set('sort', nextSort);
      params.set('dir', nextDir);
    }
    const s = params.toString();
    return s ? `/cases?${s}` : '/cases';
  }

  function sortHref(nextSort: string, nextDir: SortDir): string {
    // При смене sort'a возвращаемся на первую страницу.
    return buildHref({ sort: nextSort, dir: nextDir, page: 1 });
  }

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Дела
          </h1>
          <p className="text-[13px] text-text-muted">
            {total === 0
              ? 'Пока нет дел'
              : `Всего: ${total} ${plural(total, ['дело', 'дела', 'дел'])}`}
          </p>
        </div>
        {isStaff && (
          <Button asChild>
            <Link href="/cases/new">
              <Plus size={16} strokeWidth={2} />
              Новое дело
            </Link>
          </Button>
        )}
      </header>

      {deleted && (
        <div className="text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2 max-w-md">
          Дело удалено.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <CasesSearch initial={q} />

        <CasesFilterSelect
          name="stage"
          value={stage ?? ''}
          ariaLabel="Этап"
          options={[
            { value: '', label: 'Все этапы' },
            ...CASE_STAGES.map((s) => ({
              value: s,
              label: CASE_STAGE_LABEL[s],
            })),
          ]}
        />

        <CasesFilterSelect
          name="type"
          value={caseType ?? ''}
          ariaLabel="Тип дела"
          options={[
            { value: '', label: 'Все типы' },
            ...CASE_TYPES.map((t) => ({
              value: t,
              label: CASE_TYPE_LABEL[t],
            })),
          ]}
        />

        {isStaff && (
          <CasesFilterSelect
            name="responsible"
            value={responsibleId ?? ''}
            ariaLabel="Ответственный"
            options={[
              { value: '', label: 'Все ответственные' },
              ...specialists.map((s) => ({
                value: s.id,
                label: s.full_name,
              })),
            ]}
          />
        )}

        {(stage || caseType || responsibleId) && (
          <Link
            href={buildHref({ stage: '', type: '', responsible: '', page: 1 })}
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            Сбросить
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          hasFilters={Boolean(q || stage || caseType || responsibleId)}
          isStaff={isStaff}
        />
      ) : (
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-auto max-h-[calc(100vh-16rem)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <SortableHeader
                  column="number_title"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  Номер / название
                </SortableHeader>
                <TableHead>Клиент</TableHead>
                <TableHead>Этап</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Ответственный</TableHead>
                <SortableHeader
                  column="opened_at"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  Открыто
                </SortableHeader>
                <SortableHeader
                  column="contract_sum"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                  align="right"
                >
                  Сумма
                </SortableHeader>
                <SortableHeader
                  column="debt"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                  align="right"
                >
                  Долг
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="group cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-medium text-text group-hover:text-primary transition-colors focus-visible:outline-none focus-visible:text-primary"
                    >
                      {c.number_title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.client ? (
                      <Link
                        href={`/clients/${c.client.id}`}
                        className="text-[13px] text-text-muted hover:text-primary transition-colors"
                      >
                        {c.client.name}
                      </Link>
                    ) : (
                      <Empty />
                    )}
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={c.stage} />
                  </TableCell>
                  <TableCell className="text-[13px] text-text-muted">
                    {CASE_TYPE_LABEL[c.case_type]}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={c.priority} />
                  </TableCell>
                  <TableCell>
                    {c.responsible ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={c.responsible.full_name} size="sm" />
                        <span className="text-[13px] text-text">
                          {c.responsible.full_name}
                        </span>
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] text-text-muted">
                    {DATE_FMT.format(new Date(c.opened_at))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                    {MONEY_FMT.format(c.contract_sum)} ₴
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums whitespace-nowrap ${c.debt > 0 ? 'text-error' : 'text-text-muted'}`}
                  >
                    {MONEY_FMT.format(c.debt)} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label="Пагинация"
        >
          <p className="text-[12px] text-text-muted">
            Страница {page} из {pageCount} · по {CASES_PAGE_SIZE} на странице
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
              ← Назад
            </PageLink>
            <PageLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= pageCount}
            >
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

function EmptyState({
  hasFilters,
  isStaff,
}: {
  hasFilters: boolean;
  isStaff: boolean;
}) {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <Briefcase size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">
        {hasFilters ? 'Ничего не нашли' : 'Здесь будут дела'}
      </h2>
      <p className="text-[13px] text-text-muted max-w-md mb-5">
        {hasFilters
          ? 'Попробуйте изменить фильтры или сбросить их.'
          : isStaff
            ? 'Создайте первое дело — оно соберёт вокруг себя клиента, документы, задачи и финансы.'
            : 'У вас пока нет назначенных дел. Они появятся здесь, когда офис заведёт первое.'}
      </p>
      {!hasFilters && isStaff && (
        <Button asChild>
          <Link href="/cases/new">
            <Plus size={16} strokeWidth={2} />
            Новое дело
          </Link>
        </Button>
      )}
    </div>
  );
}

function Empty() {
  return <span className="text-[13px] text-text-subtle">—</span>;
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
