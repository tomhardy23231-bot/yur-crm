import Link from 'next/link';
import { Briefcase, LayoutGrid, Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StageBadge } from '@/components/ui/stage-badge';
import { CategoryBadge } from '@/components/ui/category-badge';
import { PaymentProgress } from '@/components/cases/payment-progress';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ClickableRow } from '@/components/ui/clickable-row';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { CasesSearch } from '@/components/cases/cases-search';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { requireUser } from '@/lib/auth/require-role';
import { daysSince, formatMoney, pluralDays } from '@/lib/utils';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import {
  CASES_DEFAULT_SORT,
  CASES_PAGE_SIZE,
  CASES_SORTABLE_COLUMNS,
  type CasesSortColumn,
  listCases,
  listClientsForSelect,
  listExpertsForFilter,
  listLawyersForFilter,
} from '@/lib/cases/queries';
import {
  CASE_CATEGORIES,
  CASE_CATEGORY_LABEL,
  CASE_STAGE_LABEL,
  CASE_STAGES,
  CASE_TYPE_LABEL,
  CASE_TYPES,
  STAFF_ROLES,
  type CaseCategory,
  type CaseStage,
  type CaseType,
} from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// U6: порог «застоя» дела на этапе — дольше подсвечиваем предупреждающим цветом.
const STALE_STAGE_DAYS = 14;

function isCaseStage(value: string): value is CaseStage {
  return (CASE_STAGES as readonly string[]).includes(value);
}
function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}
function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
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
    category?: string;
    responsible?: string;
    lawyer?: string;
    client?: string;
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
  const category =
    sp.category && isCaseCategory(sp.category) ? sp.category : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;
  const lawyerId =
    sp.lawyer && UUID_RE.test(sp.lawyer) ? sp.lawyer : undefined;
  const clientId =
    sp.client && UUID_RE.test(sp.client) ? sp.client : undefined;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;
  const deleted = sp.deleted === '1';
  const sort: CasesSortColumn =
    sp.sort && isCasesSortColumn(sp.sort) ? sp.sort : CASES_DEFAULT_SORT.sort;
  const dir: SortDir =
    sp.dir && isSortDir(sp.dir) ? sp.dir : CASES_DEFAULT_SORT.dir;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // Списки для staff-фильтров (юрист / эксперт / клиент). Юристам/Експертам они
  // не нужны: те и так видят только свои дела. Эксперты/юристы — только «реальные»
  // роли (без owner/admin) — U3.
  const [experts, lawyers, clients] = isStaff
    ? await Promise.all([
        listExpertsForFilter(),
        listLawyersForFilter(),
        listClientsForSelect(),
      ])
    : [[], [], []];

  const result = await listCases({
    q, stage, caseType, category, responsibleId, lawyerId, clientId, page, sort, dir,
  });
  const { items, pageCount } = result;

  function buildHref(
    overrides: Partial<{
      q: string;
      stage: string;
      type: string;
      category: string;
      responsible: string;
      lawyer: string;
      client: string;
      page: number;
      sort: string;
      dir: string;
    }>,
  ): string {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextStage = overrides.stage ?? stage ?? '';
    const nextType = overrides.type ?? caseType ?? '';
    const nextCategory = overrides.category ?? category ?? '';
    const nextResp = overrides.responsible ?? responsibleId ?? '';
    const nextLawyer = overrides.lawyer ?? lawyerId ?? '';
    const nextClient = overrides.client ?? clientId ?? '';
    const nextPage = overrides.page ?? page;
    const nextSort = overrides.sort ?? sort;
    const nextDir = overrides.dir ?? dir;
    if (nextQ) params.set('q', nextQ);
    if (nextStage) params.set('stage', nextStage);
    if (nextType) params.set('type', nextType);
    if (nextCategory) params.set('category', nextCategory);
    if (nextResp) params.set('responsible', nextResp);
    if (nextLawyer) params.set('lawyer', nextLawyer);
    if (nextClient) params.set('client', nextClient);
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

  // Переход на канбан-доску с сохранением совместимых фильтров (тип, ответственный).
  function boardHref(): string {
    const params = new URLSearchParams();
    if (caseType) params.set('type', caseType);
    if (responsibleId) params.set('responsible', responsibleId);
    const s = params.toString();
    return s ? `/cases/board?${s}` : '/cases/board';
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
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

        <CasesFilterSelect
          name="category"
          value={category ?? ''}
          ariaLabel="Категория"
          options={[
            { value: '', label: 'Все категории' },
            ...CASE_CATEGORIES.map((c) => ({
              value: c,
              label: CASE_CATEGORY_LABEL[c],
            })),
          ]}
        />

        {isStaff && (
          <CasesFilterSelect
            name="responsible"
            value={responsibleId ?? ''}
            ariaLabel="Эксперт"
            options={[
              { value: '', label: 'Все эксперты' },
              ...experts.map((s) => ({
                value: s.id,
                label: s.full_name,
              })),
            ]}
          />
        )}

        {isStaff && (
          <CasesFilterSelect
            name="lawyer"
            value={lawyerId ?? ''}
            ariaLabel="Юрист"
            options={[
              { value: '', label: 'Все юристы' },
              ...lawyers.map((s) => ({
                value: s.id,
                label: s.full_name,
              })),
            ]}
          />
        )}

        {isStaff && (
          <CasesFilterSelect
            name="client"
            value={clientId ?? ''}
            ariaLabel="Клиент"
            options={[
              { value: '', label: 'Все клиенты' },
              ...clients.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
        )}

        {(stage || caseType || category || responsibleId || lawyerId || clientId) && (
          <Link
            href={buildHref({
              stage: '', type: '', category: '', responsible: '',
              lawyer: '', client: '', page: 1,
            })}
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            Сбросить
          </Link>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button asChild variant="secondary">
            <Link href={boardHref()}>
              <LayoutGrid size={16} strokeWidth={1.75} />
              Доска
            </Link>
          </Button>
          {isStaff && (
            <Button asChild>
              <Link href="/cases/new">
                <Plus size={16} strokeWidth={2} />
                Новое дело
              </Link>
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          hasFilters={Boolean(
            q || stage || caseType || category || responsibleId || lawyerId || clientId,
          )}
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
                <TableHead>Категория</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Эксперт</TableHead>
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
                <ClickableRow
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="group cursor-pointer"
                >
                  <TableCell className="relative">
                    {/* Латунная полоска слева — заполняется из центра при наведении на строку */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-l-lg [box-shadow:inset_3px_0_0_var(--primary)] [clip-path:inset(50%_0)] transition-[clip-path] duration-[400ms] ease-out group-hover:[clip-path:inset(0)]"
                    />
                    <Link
                      href={`/cases/${c.id}`}
                      className="relative inline-block font-medium text-text transition-[color,transform] duration-200 ease-out group-hover:translate-x-1 group-hover:text-primary focus-visible:outline-none focus-visible:text-primary"
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
                    <span className="inline-flex items-center gap-1.5">
                      <StageBadge stage={c.stage} />
                      {c.closed_without_act && (
                        <Badge
                          tone="warning"
                          title="Дело завершено без акта приёма-передачи"
                        >
                          без акта
                        </Badge>
                      )}
                    </span>
                    {/* U6: сколько дней дело на текущем этапе (видно зависшие). */}
                    {c.stage !== 'closed' && (
                      <StageDays days={daysSince(c.stage_changed_at)} />
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-text-muted">
                    {CASE_TYPE_LABEL[c.case_type]}
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={c.category} />
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
                  <TableCell className="text-right">
                    <div className="ml-auto flex w-32 flex-col items-end gap-1">
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        {formatMoney(c.contract_sum)} ₴
                      </span>
                      <PaymentProgress
                        paid={Math.max(0, c.contract_sum - c.debt)}
                        total={c.contract_sum}
                        className="w-full"
                      />
                    </div>
                  </TableCell>
                  {/* U7: долг ИЛИ переплата (взаимоисключающи). Переплата —
                      info-цветом со знаком +, чтобы её было видно (раньше показывался 0). */}
                  <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                    {c.overpaid > 0 ? (
                      <span className="text-info" title="Переплата клиента">
                        +{formatMoney(c.overpaid)} ₴
                      </span>
                    ) : (
                      <span className={c.debt > 0 ? 'text-error' : 'text-text-muted'}>
                        {formatMoney(c.debt)} ₴
                      </span>
                    )}
                  </TableCell>
                </ClickableRow>
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

// U6: «N дней на этапе» под бейджем этапа. Застой (≥ порога) — предупреждающий цвет.
function StageDays({ days }: { days: number }) {
  const stale = days >= STALE_STAGE_DAYS;
  return (
    <div
      className={`mt-1 text-[11px] tabular-nums ${stale ? 'font-medium text-warning' : 'text-text-subtle'}`}
      title={`Дело на текущем этапе ${days} ${pluralDays(days)}`}
    >
      {days} {pluralDays(days)} на этапе
    </div>
  );
}
