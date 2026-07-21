import Link from 'next/link';
import { cookies } from 'next/headers';
import { Archive, Briefcase, ExternalLink, History, LayoutGrid, Pencil, Plus } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StageBadge } from '@/components/ui/stage-badge';
import { CategoryBadge } from '@/components/ui/category-badge';
import { PaymentProgress } from '@/components/cases/payment-progress';
import { UUID_RE } from '@/lib/validation';
import {
  CardListShell,
  CardHead,
  CardSortHead,
  RowAction,
} from '@/components/ui/card-table';
import { ClickableCard } from '@/components/ui/clickable-card';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { CasesMoreFilters } from '@/components/cases/cases-more-filters';
import { CasesQuickFilters } from '@/components/cases/quick-filters';
import { CasesSavedViews } from '@/components/cases/cases-saved-views';
import {
  CasesColumnsButton,
  CasesColumnsScope,
  CasesViewProvider,
} from '@/components/cases/cases-view-settings';
import { CasesDateFilter } from '@/components/cases/cases-date-filter';
import { CasesPageSize } from '@/components/cases/cases-page-size';
import { ArchiveCaseForm } from '@/components/cases/archive-case-form';
import { CasesSearch } from '@/components/cases/cases-search';
import { CaseListMobile } from '@/components/cases/case-list-mobile';
import { PriorityBadge } from '@/components/cases/priority-badge';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { cn, daysSince, formatMoney } from '@/lib/utils';
import { type SortDir } from '@/components/ui/sortable-header';
import {
  CASES_DEFAULT_SORT,
  CASES_PAGE_SIZE,
  CASES_PAGE_SIZES,
  CASES_SORTABLE_COLUMNS,
  type CasesSortColumn,
  countCasesByStage,
  listCases,
  listClientsForSelect,
  listExpertsForFilter,
  listLawyersForFilter,
} from '@/lib/cases/queries';
import {
  CASES_PAGE_SIZE_COOKIE,
  STALE_STAGE_DAYS,
} from '@/lib/cases/constants';
import {
  CASES_DEFAULT_MIN_WIDTH,
  CASES_DEFAULT_TEMPLATE,
} from '@/lib/cases/list-columns';
import { listActiveDepartments } from '@/lib/departments/queries';
import {
  CASE_CATEGORIES,
  CASE_STAGES,
  CASE_TYPES,
  STAFF_ROLES,
  canSeeAllCases,
  type CaseCategory,
  type CaseStage,
  type CaseType,
} from '@/lib/types/db';

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Колонки «карточек-строк» десктоп-списка (общие для шапки и строк):
// номер/клиент·тип · этап · категория · приоритет · эксперт · открыто · сумма ·
// долг · действия. Реестр ширин — lib/cases/list-columns.ts; фактический шаблон
// приходит CSS-переменной из CasesColumnsScope (настройка видимости колонок),
// дефолт — все колонки. Ниже minWidth контейнер скроллится по горизонтали.
const CASES_COLS = `var(--cases-cols, ${CASES_DEFAULT_TEMPLATE})`;
const CASES_MIN_WIDTH = `var(--cases-minw, ${CASES_DEFAULT_MIN_WIDTH}px)`;

// Дата YYYY-MM-DD — для фильтра по дате закрытия (вкладка «Архив»).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCaseStage(value: string): value is CaseStage {
  return (CASE_STAGES as readonly string[]).includes(value);
}
function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}
function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}

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
    department?: string;
    debt?: string;
    archived?: string;
    closed_from?: string;
    closed_to?: string;
    page?: string;
    deleted?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const user = await requireUser();
  const { t, fmt, plural } = await getT();
  const sp = await searchParams;

  // Вкладка «Архив»: дело лежит в архиве по отдельному признаку (не по этапу).
  const archived = sp.archived === '1';

  const q = sp.q?.trim() ?? '';
  // Этап — фильтр только активной вкладки (в архиве все дела завершены).
  const stage =
    !archived && sp.stage && isCaseStage(sp.stage) ? sp.stage : undefined;
  const debtOnly = !archived && sp.debt === 'true';
  const caseType = sp.type && isCaseType(sp.type) ? sp.type : undefined;
  const category =
    sp.category && isCaseCategory(sp.category) ? sp.category : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;
  const lawyerId =
    sp.lawyer && UUID_RE.test(sp.lawyer) ? sp.lawyer : undefined;
  const clientId =
    sp.client && UUID_RE.test(sp.client) ? sp.client : undefined;
  // Фильтр подразделения — только тем, кто видит >1 (owner / staff со scope='all'
  // либо department_id IS NULL). RLS всё равно ограничивает выдачу.
  const canSeeDepartments = canSeeAllCases(user.profile, user.caps);
  const departmentId =
    canSeeDepartments && sp.department && UUID_RE.test(sp.department)
      ? sp.department
      : undefined;
  // Фильтр по дате закрытия — только на вкладке «Архив».
  const closedFrom =
    archived && sp.closed_from && DATE_RE.test(sp.closed_from)
      ? sp.closed_from
      : undefined;
  const closedTo =
    archived && sp.closed_to && DATE_RE.test(sp.closed_to)
      ? sp.closed_to
      : undefined;
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;
  const deleted = sp.deleted === '1';
  const sort: CasesSortColumn =
    sp.sort && isCasesSortColumn(sp.sort) ? sp.sort : CASES_DEFAULT_SORT.sort;
  const dir: SortDir =
    sp.dir && isSortDir(sp.dir) ? sp.dir : CASES_DEFAULT_SORT.dir;

  // Размер страницы — личный выбор пользователя, живёт в cookie (не в URL).
  const pageSizeRaw = Number(
    (await cookies()).get(CASES_PAGE_SIZE_COOKIE)?.value,
  );
  const pageSize = (CASES_PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : CASES_PAGE_SIZE;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // Списки для staff-фильтров (юрист / эксперт / клиент). Юристам/Експертам они
  // не нужны: те и так видят только свои дела. Эксперты/юристы — только «реальные»
  // роли (без owner/admin) — U3.
  // 4.2: справочники фильтров и список+счётчики дел независимы — запускаем одним
  // батчем (раньше были два последовательных await). Для не-staff справочники пусты.
  const emptyRefs: [
    Awaited<ReturnType<typeof listExpertsForFilter>>,
    Awaited<ReturnType<typeof listLawyersForFilter>>,
    Awaited<ReturnType<typeof listClientsForSelect>>,
    Awaited<ReturnType<typeof listActiveDepartments>>,
  ] = [[], [], [], []];

  const [[experts, lawyers, clients, departments], result, stageCounts] =
    await Promise.all([
      isStaff
        ? Promise.all([
            listExpertsForFilter(),
            listLawyersForFilter(),
            listClientsForSelect(),
            canSeeDepartments ? listActiveDepartments() : Promise.resolve([]),
          ])
        : Promise.resolve(emptyRefs),
      listCases({
        q, stage, caseType, category, responsibleId, lawyerId, clientId, departmentId,
        debtOnly, archived, closedFrom, closedTo, page, pageSize, sort, dir,
      }),
      countCasesByStage({
        caseType, category, responsibleId, lawyerId, clientId, departmentId, debtOnly,
      }),
    ]);
  const { items, pageCount } = result;
  const totalByStage = CASE_STAGES.reduce((sum, s) => sum + stageCounts[s], 0);

  // Активны ли фильтры внутри текущей вкладки (вкладка «Архив» сама по себе
  // фильтром не считается — иначе «нет фильтров» и empty-state были бы неверны).
  const hasFilters = Boolean(
    q || stage || caseType || category || responsibleId || lawyerId || clientId ||
      departmentId || closedFrom || closedTo,
  );

  // Сколько второстепенных фильтров (люди/подразделение) активно — бейдж на
  // кнопке-поповере «Фильтры» (редизайн Волна 2).
  const moreActiveCount = [responsibleId, lawyerId, clientId, departmentId].filter(
    Boolean,
  ).length;

  function buildHref(
    overrides: Partial<{
      q: string;
      stage: string;
      type: string;
      category: string;
      responsible: string;
      lawyer: string;
      client: string;
      department: string;
      debt: string;
      archived: string;
      closed_from: string;
      closed_to: string;
      page: number;
      sort: string;
      dir: string;
    }>,
  ): string {
    const params = new URLSearchParams();
    const nextQ = overrides.q ?? q;
    const nextArchived = overrides.archived ?? (archived ? '1' : '');
    const isArchive = nextArchived === '1';
    // На архивной вкладке этап/долг неактуальны; на активной — даты закрытия.
    const nextStage = isArchive ? '' : overrides.stage ?? stage ?? '';
    const nextType = overrides.type ?? caseType ?? '';
    const nextCategory = overrides.category ?? category ?? '';
    const nextResp = overrides.responsible ?? responsibleId ?? '';
    const nextLawyer = overrides.lawyer ?? lawyerId ?? '';
    const nextClient = overrides.client ?? clientId ?? '';
    const nextDepartment = overrides.department ?? departmentId ?? '';
    const nextDebt = isArchive ? '' : overrides.debt ?? (debtOnly ? 'true' : '');
    const nextClosedFrom = isArchive
      ? overrides.closed_from ?? closedFrom ?? ''
      : '';
    const nextClosedTo = isArchive ? overrides.closed_to ?? closedTo ?? '' : '';
    const nextPage = overrides.page ?? page;
    const nextSort = overrides.sort ?? sort;
    const nextDir = overrides.dir ?? dir;
    if (nextQ) params.set('q', nextQ);
    if (nextArchived) params.set('archived', nextArchived);
    if (nextStage) params.set('stage', nextStage);
    if (nextType) params.set('type', nextType);
    if (nextCategory) params.set('category', nextCategory);
    if (nextResp) params.set('responsible', nextResp);
    if (nextLawyer) params.set('lawyer', nextLawyer);
    if (nextClient) params.set('client', nextClient);
    if (nextDepartment) params.set('department', nextDepartment);
    if (nextDebt) params.set('debt', nextDebt);
    if (nextClosedFrom) params.set('closed_from', nextClosedFrom);
    if (nextClosedTo) params.set('closed_to', nextClosedTo);
    if (nextPage > 1) params.set('page', String(nextPage));
    // Не шумим в URL дефолтным sort'ом — храним только когда отличается.
    if (nextSort !== CASES_DEFAULT_SORT.sort || nextDir !== CASES_DEFAULT_SORT.dir) {
      params.set('sort', nextSort);
      params.set('dir', nextDir);
    }
    const s = params.toString();
    return s ? `/cases?${s}` : '/cases';
  }

  // Переход между вкладками «Активные» / «Архив» с сохранением совместимых
  // фильтров (тип/категория/эксперт/юрист/клиент/поиск); этап и даты сбрасывает
  // buildHref сам по принадлежности к вкладке. Возврат на 1-ю страницу.
  function tabHref(toArchive: boolean): string {
    return buildHref({ archived: toArchive ? '1' : '', page: 1 });
  }

  function sortHref(nextSort: string, nextDir: SortDir): string {
    // При смене sort'a возвращаемся на первую страницу.
    return buildHref({ sort: nextSort, dir: nextDir, page: 1 });
  }

  // Переход на канбан-доску с сохранением совместимых фильтров (6.5: тип,
  // категория, ответственный, подразделение). Поиск q доска не применяет, но
  // переносим, чтобы он не терялся при возврате на список (там покажет подпись).
  function boardHref(): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (caseType) params.set('type', caseType);
    if (category) params.set('category', category);
    if (responsibleId) params.set('responsible', responsibleId);
    if (departmentId) params.set('department', departmentId);
    const s = params.toString();
    return s ? `/cases/board?${s}` : '/cases/board';
  }

  // Опции фильтра этапа (выпадающий список в ряду фильтров): «Все этапы» +
  // 5 этапов воронки, со счётчиками в подписях (бриф §6).
  const stageOptions = [
    { value: '', label: `${t.cases.filters.allStages} · ${totalByStage}` },
    ...CASE_STAGES.map((s) => ({
      value: s,
      label: `${t.enums.caseStage[s]} · ${stageCounts[s]}`,
    })),
  ];

  return (
    <CasesViewProvider>
    <main className="flex flex-col gap-3 px-3 py-2 sm:px-4">
      {deleted && (
        <div className="text-[13px] text-success bg-success-bg border border-success/20 rounded-md px-3 py-2 max-w-md">
          {t.cases.deletedNotice}
        </div>
      )}

      <div data-tour="cases-toolbar" className="flex flex-col gap-3">
        {/* Ряд 1: поиск + действия (доска · новое дело) + вкладки Активные/Архив
            в правом углу (ml-auto). На мобильных подписи кнопок прячутся; если
            не хватает ширины, вкладки переносятся на новую строку, оставаясь
            справа (flex-wrap). */}
        <div className="flex flex-wrap items-center gap-2">
          <CasesSearch initial={q} />
          <Button asChild variant="secondary" className="shrink-0 px-3 sm:px-4">
            <Link href={boardHref()} data-tour="cases-board">
              <LayoutGrid size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t.cases.toolbar.board}</span>
            </Link>
          </Button>
          {/* На ≥md «Нова справа» живёт в топбаре (там же data-tour) — здесь
              кнопка остаётся только для мобильных. */}
          {isStaff && (
            <Button asChild className="shrink-0 px-3 sm:px-4 md:hidden">
              <Link href="/cases/new">
                <Plus size={16} strokeWidth={2} />
                <span className="hidden sm:inline">{t.cases.toolbar.newCase}</span>
              </Link>
            </Button>
          )}

          {/* Быстрые пресеты (v3 s11) — только на активной вкладке: «С долгом» и
              «Зависшие» в архиве не работают, «Закрытые за месяц» сам ведёт в архив.
              Рядом — личные сохранённые виды (v4, localStorage). */}
          {!archived && <CasesQuickFilters sp={sp} extra={<CasesSavedViews />} />}

          {/* Вкладки: активные дела / архив — сегмент-контрол каркаса. */}
          <div
            role="tablist"
            aria-label={t.cases.tabs.aria}
            className="ml-auto flex items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5"
          >
            {[
              { archive: false, label: t.cases.tabs.active },
              { archive: true, label: t.cases.tabs.archive },
            ].map((tab) => {
              const active = tab.archive === archived;
              return (
                <Link
                  key={tab.label}
                  href={tabHref(tab.archive)}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-all',
                    active
                      ? 'bg-primary-subtle text-primary-pressed'
                      : 'text-text-subtle hover:text-text',
                  )}
                >
                  {tab.archive && <Archive size={14} strokeWidth={1.75} />}
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Ряд 2: фильтры — горизонтальная лента (свайп) на узких экранах,
            обычный перенос на ≥ sm. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Основные фильтры — лента (свайп) на узких экранах. «Фильтры»-поповер
              вынесен НАРУЖУ ленты: overflow-x-auto иначе клипал бы выпадашку. */}
          <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {/* Активная вкладка — фильтр этапа (воронка) со счётчиками.
              Вкладка «Архив» — фильтр по дате закрытия дела (этапы там не нужны). */}
          {archived ? (
            <CasesDateFilter
              from={closedFrom ?? ''}
              to={closedTo ?? ''}
              fromLabel={t.cases.archive.closedFromLabel}
              toLabel={t.cases.archive.closedToLabel}
              fromAria={t.cases.archive.closedFromAria}
              toAria={t.cases.archive.closedToAria}
            />
          ) : (
            <CasesFilterSelect
              name="stage"
              value={stage ?? ''}
              ariaLabel={t.cases.filters.stageAria}
              options={stageOptions}
            />
          )}

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

          </div>

          {/* Второстепенные фильтры (люди/подразделение) — в поповере «Фильтры»,
              чтобы основной ряд не был перегружен (редизайн Волна 2). */}
          {isStaff && (
            <CasesMoreFilters label={t.cases.filters.more} activeCount={moreActiveCount}>
              <CasesFilterSelect
                name="responsible"
                value={responsibleId ?? ''}
                ariaLabel={t.cases.filters.expertAria}
                options={[
                  { value: '', label: t.cases.filters.allExperts },
                  ...experts.map((s) => ({ value: s.id, label: s.full_name })),
                ]}
              />
              <CasesFilterSelect
                name="lawyer"
                value={lawyerId ?? ''}
                ariaLabel={t.cases.filters.lawyerAria}
                options={[
                  { value: '', label: t.cases.filters.allLawyers },
                  ...lawyers.map((s) => ({ value: s.id, label: s.full_name })),
                ]}
              />
              <CasesFilterSelect
                name="client"
                value={clientId ?? ''}
                ariaLabel={t.cases.filters.clientAria}
                options={[
                  { value: '', label: t.cases.filters.allClients },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              {canSeeDepartments && (
                <CasesFilterSelect
                  name="department"
                  value={departmentId ?? ''}
                  ariaLabel={t.cases.filters.departmentAria}
                  options={[
                    { value: '', label: t.cases.filters.allDepartments },
                    ...departments.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              )}
            </CasesMoreFilters>
          )}

          {/* Видимость колонок списка (только десктоп-представление). */}
          <CasesColumnsButton />

          {(hasFilters || debtOnly) && (
            <Link
              href={buildHref({
                stage: '', type: '', category: '', responsible: '',
                lawyer: '', client: '', department: '', debt: '', closed_from: '',
                closed_to: '', page: 1,
              })}
              className="shrink-0 whitespace-nowrap px-1 text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              {t.cases.toolbar.reset}
            </Link>
          )}
        </div>
      </div>

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
        <div className="rounded-card border border-dashed border-border bg-surface py-8">
          <EmptyState
            icon={archived ? Archive : Briefcase}
            title={
              archived
                ? hasFilters
                  ? t.cases.empty.notFoundTitle
                  : t.cases.archive.emptyTitle
                : hasFilters
                  ? t.cases.empty.notFoundTitle
                  : t.cases.empty.title
            }
            hint={
              archived
                ? hasFilters
                  ? t.cases.archive.emptyFilteredHint
                  : t.cases.archive.emptyHint
                : hasFilters
                  ? t.cases.empty.notFoundHint
                  : isStaff
                    ? t.cases.empty.staffHint
                    : t.cases.empty.nonStaffHint
            }
            // Создавать дело предлагаем только на активной вкладке без фильтров.
            action={
              !hasFilters && isStaff && !archived ? (
                <Button asChild>
                  <Link href="/cases/new">
                    <Plus size={16} strokeWidth={2} />
                    {t.cases.toolbar.newCase}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
        {/* Мобильное представление — компактные карточки вместо таблицы. */}
        <CaseListMobile items={items} isStaff={isStaff} archived={archived} />

        {/* Десктоп (≥ md) — «карточки-строки»: каждое дело отдельной карточкой.
            CasesColumnsScope задаёт шаблон сетки по настройке «Колонки». */}
        <CasesColumnsScope>
        <CardListShell
          cols={CASES_COLS}
          minWidth={CASES_MIN_WIDTH}
          ariaLabel={t.cases.tableAria}
          header={
            <>
              <CardSortHead column="number_title" currentSort={sort} currentDir={dir} hrefFor={sortHref}>
                {t.cases.columns.numberTitle}
              </CardSortHead>
              <CardHead dataCol="stage">{t.cases.columns.stage}</CardHead>
              <CardHead dataCol="category">{t.cases.columns.category}</CardHead>
              <CardHead dataCol="priority">{t.cases.columns.priority}</CardHead>
              <CardHead dataCol="expert">{t.cases.columns.expert}</CardHead>
              {/* На «Архиве» дата закрытия важнее даты открытия (по ней фильтр). */}
              {archived ? (
                <CardHead dataCol="opened">{t.cases.archive.closedAtColumn}</CardHead>
              ) : (
                <CardSortHead column="opened_at" currentSort={sort} currentDir={dir} hrefFor={sortHref} dataCol="opened">
                  {t.cases.columns.openedAt}
                </CardSortHead>
              )}
              <CardSortHead column="contract_sum" currentSort={sort} currentDir={dir} hrefFor={sortHref} align="right" dataCol="sum">
                {t.cases.columns.sum}
              </CardSortHead>
              <CardSortHead column="debt" currentSort={sort} currentDir={dir} hrefFor={sortHref} align="right" dataCol="debt">
                {t.cases.columns.debt}
              </CardSortHead>
              <CardHead align="right">{t.cases.columns.actions}</CardHead>
            </>
          }
        >
          {items.map((c, i) => {
            const days = c.stage !== 'closed' ? daysSince(c.stage_changed_at) : null;
            return (
              <ClickableCard
                key={c.id}
                href={`/cases/${c.id}`}
                cols={CASES_COLS}
                data-tour={i === 0 ? 'first-case-row' : undefined}
              >
                {/* Номер / название + «клиент · тип» */}
                <div role="cell" className="min-w-0">
                  <Link
                    href={`/cases/${c.id}`}
                    className="block truncate text-[16px] leading-[1.3] font-semibold text-text transition-colors group-hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                  >
                    {c.number_title}
                  </Link>
                  {/* Крупнее (+2px, просьба владельца 21.07) при прежней высоте
                      строки: компенсируем плотным leading. */}
                  <div className="mt-0.5 truncate font-mono text-[13.5px] leading-[1.3] text-text-muted">
                    {c.client ? (
                      <Link href={`/clients/${c.client.id}`} className="text-text transition-colors hover:text-primary">
                        {c.client.name}
                      </Link>
                    ) : (
                      <Empty />
                    )}
                    <span> · {t.enums.caseType[c.case_type]}</span>
                  </div>
                </div>

                {/* Этап (залитая плашка) + дни на этапе */}
                <div role="cell" data-col="stage" className="min-w-0">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {/* Крупный текст чипа при прежней высоте: py-1 → py-[3px]. */}
                    <StageBadge
                      stage={c.stage}
                      pulse={false}
                      className="px-2.5 py-[3px] text-[14px]"
                    />
                    {c.outcome === 'lost' && (
                      <Badge tone="neutral" title={t.cases.lost.badgeTitle}>
                        {t.cases.lost.badge}
                      </Badge>
                    )}
                    {c.closed_without_act && (
                      <Badge tone="warning" title={t.cases.row.withoutActTitle}>
                        {t.cases.row.withoutAct}
                      </Badge>
                    )}
                  </span>
                  {days !== null && (
                    <StageDays
                      days={days}
                      label={plural(t.cases.row.stageDays, days)}
                      title={plural(t.cases.row.stageDaysTitle, days)}
                    />
                  )}
                </div>

                {/* Категория — залитый бейдж (каркас 2026-07-13). */}
                <div role="cell" data-col="category" className="min-w-0">
                  <CategoryBadge
                    category={c.category}
                    className="py-0.5 text-[13px] leading-[1.2]"
                  />
                </div>

                {/* Приоритет */}
                <div role="cell" data-col="priority" className="min-w-0">
                  <PriorityBadge priority={c.priority} className="text-[14px]" />
                </div>

                {/* Эксперт: аватар + имя + роль */}
                <div role="cell" data-col="expert" className="min-w-0">
                  {c.responsible ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={c.responsible.full_name} size="sm" shape="square" />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[15px] leading-[1.25] font-medium text-text">{c.responsible.full_name}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                          {t.enums.roleInCase.expert}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Empty />
                  )}
                </div>

                {/* Открыто (актив) / Закрыто (архив — по этой дате фильтр) */}
                <div role="cell" data-col="opened" className="text-[14.5px] leading-[1.25] tabular-nums text-text">
                  {archived ? (
                    c.closed_at ? (
                      DATE_FMT.format(new Date(c.closed_at))
                    ) : (
                      <Empty />
                    )
                  ) : (
                    DATE_FMT.format(new Date(c.opened_at))
                  )}
                </div>

                {/* Сумма + прогресс оплаты */}
                <div role="cell" data-col="sum" className="text-right">
                  <div className="ml-auto flex w-full flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-[16px] leading-[1.25] tabular-nums">{formatMoney(c.contract_sum)} ₴</span>
                    <PaymentProgress
                      paid={Math.max(0, c.contract_sum - c.debt)}
                      total={c.contract_sum}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* U7: долг ИЛИ переплата (взаимоисключающи). */}
                <div role="cell" data-col="debt" className="whitespace-nowrap text-right text-[16px] leading-[1.25] tabular-nums">
                  {c.overpaid > 0 ? (
                    <span className="font-medium text-info-text" title={t.cases.row.overpaid}>
                      +{formatMoney(c.overpaid)} ₴
                    </span>
                  ) : (
                    <span className={c.debt > 0 ? 'text-error' : 'text-text-muted'}>
                      {formatMoney(c.debt)} ₴
                    </span>
                  )}
                </div>

                {/* Действия: открыть · история · редактировать · архив/восстановить
                    (правка/архив — только staff). «В архив» — лишь у завершённых
                    дел на активной вкладке; «Восстановить» — на вкладке «Архив». */}
                <div role="cell" className="flex items-center justify-end gap-1">
                  <RowAction
                    href={`/cases/${c.id}`}
                    external
                    label={t.cases.row.actionOpen}
                    icon={<ExternalLink size={15} strokeWidth={1.75} />}
                  />
                  <RowAction
                    href={`/cases/${c.id}#history`}
                    label={t.cases.row.actionHistory}
                    icon={<History size={15} strokeWidth={1.75} />}
                  />
                  {isStaff && (
                    <RowAction
                      href={`/cases/${c.id}/edit`}
                      label={t.cases.row.actionEdit}
                      icon={<Pencil size={15} strokeWidth={1.75} />}
                    />
                  )}
                  {isStaff && archived && (
                    <ArchiveCaseForm
                      caseId={c.id}
                      caseTitle={c.number_title}
                      mode="restore"
                    />
                  )}
                  {isStaff && !archived && c.stage === 'closed' && (
                    <ArchiveCaseForm
                      caseId={c.id}
                      caseTitle={c.number_title}
                      mode="archive"
                    />
                  )}
                </div>
              </ClickableCard>
            );
          })}
        </CardListShell>
        </CasesColumnsScope>
        </>
      )}

      {/* Нижняя панель показывается всегда при наличии дел: селект «по N на
          сторінці» должен быть доступен и когда всё влезло на одну страницу. */}
      {items.length > 0 && (
        <nav
          className="flex flex-wrap items-center justify-between gap-2"
          aria-label={t.cases.pagination.aria}
        >
          <p className="text-[12px] text-text-muted">
            {fmt(t.cases.pagination.info, {
              page,
              pageCount,
              size: pageSize,
            })}
          </p>
          <div className="flex items-center gap-2">
            <CasesPageSize
              value={pageSize}
              ariaLabel={t.cases.pagination.perPageAria}
              options={CASES_PAGE_SIZES.map((n) => ({
                value: n,
                label: fmt(t.cases.pagination.perPageOption, { size: n }),
              }))}
            />
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
    </CasesViewProvider>
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
      className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-primary-softer transition-colors"
    >
      {children}
    </Link>
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
      className={`mt-1 text-[13px] leading-[1.25] tabular-nums ${stale ? 'font-medium text-warning' : 'text-text-muted'}`}
      title={title}
    >
      {label}
    </div>
  );
}
