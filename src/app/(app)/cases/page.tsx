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
import {
  StatusFilterStrip,
  type StatusChip,
} from '@/components/ui/status-filter-strip';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { CasesSearch } from '@/components/cases/cases-search';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { daysSince, formatMoney } from '@/lib/utils';
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import {
  CASES_DEFAULT_SORT,
  CASES_PAGE_SIZE,
  CASES_SORTABLE_COLUMNS,
  type CasesSortColumn,
  countCasesByStage,
  listCases,
  listClientsForSelect,
  listExpertsForFilter,
  listLawyersForFilter,
} from '@/lib/cases/queries';
import {
  CASE_CATEGORIES,
  CASE_STAGES,
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

// Цвет точки этапа для строки статус-фильтров.
const STAGE_DOT: Record<CaseStage, string> = {
  new_request: 'bg-stage-new',
  consultation: 'bg-stage-consultation',
  in_progress: 'bg-stage-in-progress',
  awaiting_decision: 'bg-stage-awaiting',
  closed: 'bg-stage-closed',
};

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
    debt?: string;
    page?: string;
    deleted?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const user = await requireUser();
  const { t, fmt, plural } = await getT();
  const sp = await searchParams;

  const q = sp.q?.trim() ?? '';
  const stage = sp.stage && isCaseStage(sp.stage) ? sp.stage : undefined;
  const debtOnly = sp.debt === 'true';
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

  const [result, stageCounts] = await Promise.all([
    listCases({
      q, stage, caseType, category, responsibleId, lawyerId, clientId, debtOnly, page, sort, dir,
    }),
    countCasesByStage({ caseType, category, responsibleId, lawyerId, clientId, debtOnly }),
  ]);
  const { items, pageCount } = result;
  const totalByStage = CASE_STAGES.reduce((sum, s) => sum + stageCounts[s], 0);

  function buildHref(
    overrides: Partial<{
      q: string;
      stage: string;
      type: string;
      category: string;
      responsible: string;
      lawyer: string;
      client: string;
      debt: string;
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
    const nextDebt = overrides.debt ?? (debtOnly ? 'true' : '');
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
    if (nextDebt) params.set('debt', nextDebt);
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

  // Строка статус-фильтров по этапам (бриф §6): «Все» + 5 этапов со счётчиками.
  const stageChips: StatusChip[] = [
    {
      key: 'all',
      label: t.cases.allStages,
      count: totalByStage,
      href: buildHref({ stage: '', page: 1 }),
      active: !stage,
    },
    ...CASE_STAGES.map((s) => ({
      key: s,
      label: t.enums.caseStage[s],
      count: stageCounts[s],
      dotClass: STAGE_DOT[s],
      href: buildHref({ stage: s, page: 1 }),
      active: stage === s,
    })),
  ];

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      {deleted && (
        <div className="text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2 max-w-md">
          {t.cases.deletedNotice}
        </div>
      )}

      <div data-tour="cases-toolbar" className="flex flex-wrap items-center gap-3">
        <CasesSearch initial={q} />

        <CasesFilterSelect
          name="type"
          value={caseType ?? ''}
          ariaLabel={t.cases.filters.typeAria}
          options={[
            { value: '', label: t.cases.filters.allTypes },
            ...CASE_TYPES.map((ct) => ({
              value: ct,
              label: t.enums.caseType[ct],
            })),
          ]}
        />

        <CasesFilterSelect
          name="category"
          value={category ?? ''}
          ariaLabel={t.cases.filters.categoryAria}
          options={[
            { value: '', label: t.cases.filters.allCategories },
            ...CASE_CATEGORIES.map((c) => ({
              value: c,
              label: t.enums.caseCategory[c],
            })),
          ]}
        />

        {isStaff && (
          <CasesFilterSelect
            name="responsible"
            value={responsibleId ?? ''}
            ariaLabel={t.cases.filters.expertAria}
            options={[
              { value: '', label: t.cases.filters.allExperts },
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
            ariaLabel={t.cases.filters.lawyerAria}
            options={[
              { value: '', label: t.cases.filters.allLawyers },
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
            ariaLabel={t.cases.filters.clientAria}
            options={[
              { value: '', label: t.cases.filters.allClients },
              ...clients.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
        )}

        {(stage || caseType || category || responsibleId || lawyerId || clientId || debtOnly) && (
          <Link
            href={buildHref({
              stage: '', type: '', category: '', responsible: '',
              lawyer: '', client: '', debt: '', page: 1,
            })}
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            {t.cases.toolbar.reset}
          </Link>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button asChild variant="secondary">
            <Link href={boardHref()} data-tour="cases-board">
              <LayoutGrid size={16} strokeWidth={1.75} />
              {t.cases.toolbar.board}
            </Link>
          </Button>
          {isStaff && (
            <Button asChild>
              <Link href="/cases/new" data-tour="cases-new">
                <Plus size={16} strokeWidth={2} />
                {t.cases.toolbar.newCase}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <StatusFilterStrip chips={stageChips} />

      {debtOnly && (
        <p className="-mt-2 text-[12.5px] text-text-muted">
          {t.cases.debtNotice}
          <Link
            href={buildHref({ debt: '', page: 1 })}
            className="font-semibold text-primary hover:text-primary-hover"
          >
            {t.cases.debtShowAll}
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          hasFilters={Boolean(
            q || stage || caseType || category || responsibleId || lawyerId || clientId,
          )}
          isStaff={isStaff}
          title={
            Boolean(q || stage || caseType || category || responsibleId || lawyerId || clientId)
              ? t.cases.empty.notFoundTitle
              : t.cases.empty.title
          }
          hint={
            Boolean(q || stage || caseType || category || responsibleId || lawyerId || clientId)
              ? t.cases.empty.notFoundHint
              : isStaff
                ? t.cases.empty.staffHint
                : t.cases.empty.nonStaffHint
          }
          newCaseLabel={t.cases.toolbar.newCase}
        />
      ) : (
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <SortableHeader
                  column="number_title"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  {t.cases.columns.numberTitle}
                </SortableHeader>
                <TableHead>{t.cases.columns.client}</TableHead>
                <TableHead>{t.cases.columns.stage}</TableHead>
                <TableHead>{t.cases.columns.type}</TableHead>
                <TableHead>{t.cases.columns.category}</TableHead>
                <TableHead>{t.cases.columns.priority}</TableHead>
                <TableHead>{t.cases.columns.expert}</TableHead>
                <SortableHeader
                  column="opened_at"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                >
                  {t.cases.columns.openedAt}
                </SortableHeader>
                <SortableHeader
                  column="contract_sum"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                  align="right"
                >
                  {t.cases.columns.sum}
                </SortableHeader>
                <SortableHeader
                  column="debt"
                  currentSort={sort}
                  currentDir={dir}
                  hrefFor={sortHref}
                  align="right"
                >
                  {t.cases.columns.debt}
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c, i) => (
                <ClickableRow
                  key={c.id}
                  href={`/cases/${c.id}`}
                  data-tour={i === 0 ? 'first-case-row' : undefined}
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
                      className="relative inline-block font-semibold text-text transition-[color,transform] duration-200 ease-out group-hover:translate-x-1 group-hover:text-primary focus-visible:text-primary focus-visible:outline-none"
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
                      <StageBadge stage={c.stage} quiet />
                      {c.closed_without_act && (
                        <Badge
                          tone="warning"
                          title={t.cases.row.withoutActTitle}
                        >
                          {t.cases.row.withoutAct}
                        </Badge>
                      )}
                    </span>
                    {/* U6: сколько дней дело на текущем этапе (видно зависшие). */}
                    {c.stage !== 'closed' &&
                      (() => {
                        const days = daysSince(c.stage_changed_at);
                        return (
                          <StageDays
                            days={days}
                            label={plural(t.cases.row.stageDays, days)}
                            title={plural(t.cases.row.stageDaysTitle, days)}
                          />
                        );
                      })()}
                  </TableCell>
                  <TableCell className="text-[13px] text-text-muted">
                    {t.enums.caseType[c.case_type]}
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={c.category} quiet />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={c.priority} />
                  </TableCell>
                  <TableCell>
                    {c.responsible ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={c.responsible.full_name} size="sm" shape="square" />
                        <span className="text-[13px] text-text">
                          {c.responsible.full_name}
                        </span>
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </TableCell>
                  <TableCell className="text-[12.5px] text-text-muted">
                    {DATE_FMT.format(new Date(c.opened_at))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="ml-auto flex w-32 flex-col items-end gap-1">
                      <span className="tabular-nums whitespace-nowrap">
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
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {c.overpaid > 0 ? (
                      <span className="text-info" title={t.cases.row.overpaid}>
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
          aria-label={t.cases.pagination.aria}
        >
          <p className="text-[12px] text-text-muted">
            {fmt(t.cases.pagination.info, {
              page,
              pageCount,
              size: CASES_PAGE_SIZE,
            })}
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
              {t.cases.pagination.prev}
            </PageLink>
            <PageLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= pageCount}
            >
              {t.cases.pagination.next}
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
  title,
  hint,
  newCaseLabel,
}: {
  hasFilters: boolean;
  isStaff: boolean;
  title: string;
  hint: string;
  newCaseLabel: string;
}) {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <Briefcase size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">{title}</h2>
      <p className="text-[13px] text-text-muted max-w-md mb-5">{hint}</p>
      {!hasFilters && isStaff && (
        <Button asChild>
          <Link href="/cases/new">
            <Plus size={16} strokeWidth={2} />
            {newCaseLabel}
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
// label/title — уже локализованные строки (plural) из родителя.
function StageDays({
  days,
  label,
  title,
}: {
  days: number;
  label: string;
  title: string;
}) {
  const stale = days >= STALE_STAGE_DAYS;
  return (
    <div
      className={`mt-1 text-[11px] tabular-nums ${stale ? 'font-medium text-warning' : 'text-text-subtle'}`}
      title={title}
    >
      {label}
    </div>
  );
}
