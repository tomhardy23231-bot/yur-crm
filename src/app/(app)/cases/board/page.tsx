import Link from 'next/link';
import { List, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BoardColumn } from '@/components/cases/board-column';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { requireUser } from '@/lib/auth/require-role';
import {
  listCasesForBoard,
  listExpertsForAssignment,
  type BoardCaseItem,
} from '@/lib/cases/queries';
import { listActiveDepartments } from '@/lib/departments/queries';
import { getT } from '@/lib/i18n/server';
import {
  CASE_CATEGORIES,
  CASE_STAGES,
  CASE_TYPES,
  STAFF_ROLES,
  canSeeAllCases,
  type CaseCategory,
  type CaseType,
  type CaseStage,
} from '@/lib/types/db';
import { UUID_RE } from '@/lib/validation';

function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}
function isCaseCategory(value: string): value is CaseCategory {
  return (CASE_CATEGORIES as readonly string[]).includes(value);
}

export default async function CasesBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    category?: string;
    responsible?: string;
    department?: string;
  }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const caseType = sp.type && isCaseType(sp.type) ? sp.type : undefined;
  const category =
    sp.category && isCaseCategory(sp.category) ? sp.category : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;
  // Поиск на доску не ложится — q лишь катается между списком и доской,
  // чтобы не теряться; на доске показываем подпись (6.5).
  const q = sp.q?.trim() ?? '';
  // Фильтр подразделения — как на списке: только тем, кто видит >1.
  const canSeeDepartments = canSeeAllCases(user.profile, user.caps);
  const departmentId =
    canSeeDepartments && sp.department && UUID_RE.test(sp.department)
      ? sp.department
      : undefined;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  // 6.5: справочники фильтров и дела — одним батчем.
  const [experts, departments, all] = await Promise.all([
    isStaff ? listExpertsForAssignment() : Promise.resolve([]),
    canSeeDepartments ? listActiveDepartments() : Promise.resolve([]),
    listCasesForBoard({ caseType, category, responsibleId, departmentId }),
  ]);

  // Группируем дела по этапу. Order сохраняется из запроса (priority asc → opened_at desc).
  const grouped = groupByStage(all);

  // Право двигать дело вперёд: staff (owner/admin/office_manager) — любое;
  // юрист/Експерт — только своё дело (lawyer_id или responsible_id = я).
  // RLS уже отфильтровал, что видно; здесь — что можно ИЗМЕНИТЬ.
  function canAdvanceFor(c: BoardCaseItem): boolean {
    if (isStaff) return true;
    return (
      c.responsible?.id === user.profile.id ||
      c.lawyer?.id === user.profile.id
    );
  }

  // Строит href обратно на список с теми же фильтрами (симметрично boardHref).
  function listHref(): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (caseType) params.set('type', caseType);
    if (category) params.set('category', category);
    if (responsibleId) params.set('responsible', responsibleId);
    if (departmentId) params.set('department', departmentId);
    const s = params.toString();
    return s ? `/cases?${s}` : '/cases';
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4 min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <CasesFilterSelect
          name="type"
          value={caseType ?? ''}
          ariaLabel={t.cases.filters.typeAria}
          basePath="/cases/board"
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
          basePath="/cases/board"
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
            basePath="/cases/board"
            options={[
              { value: '', label: t.cases.filters.allExperts },
              ...experts.map((s) => ({
                value: s.id,
                label: s.full_name,
              })),
            ]}
          />
        )}
        {canSeeDepartments && (
          <CasesFilterSelect
            name="department"
            value={departmentId ?? ''}
            ariaLabel={t.cases.filters.departmentAria}
            basePath="/cases/board"
            options={[
              { value: '', label: t.cases.filters.allDepartments },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        )}
        {(caseType || category || responsibleId || departmentId) && (
          <Link
            href="/cases/board"
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            {t.cases.toolbar.reset}
          </Link>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button asChild variant="secondary" size="sm">
            <Link href={listHref()}>
              <List size={14} strokeWidth={1.75} />
              {t.cases.toolbar.list}
            </Link>
          </Button>
          {isStaff && (
            <Button asChild size="sm">
              <Link href="/cases/new">
                <Plus size={14} strokeWidth={2} />
                {t.cases.toolbar.newCase}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Поиск пришёл со списка, но доска по нему не фильтрует — честно говорим. */}
      {q && (
        <p className="-mt-2 text-[12.5px] text-text-muted">
          {t.cases.board.searchNotApplied}
        </p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
        {CASE_STAGES.map((stage, idx) => {
          const nextStage = CASE_STAGES[idx + 1] ?? null;
          const nextStageLabel = nextStage ? t.enums.caseStage[nextStage] : null;
          return (
            <BoardColumn
              key={stage}
              stage={stage}
              cases={grouped[stage] ?? []}
              nextStageLabel={nextStageLabel}
              canAdvanceFor={canAdvanceFor}
              showNewCaseCta={isStaff && stage === 'new_request'}
            />
          );
        })}
      </div>
    </main>
  );
}

function groupByStage(items: BoardCaseItem[]): Record<CaseStage, BoardCaseItem[]> {
  const map = Object.fromEntries(
    CASE_STAGES.map((s) => [s, [] as BoardCaseItem[]]),
  ) as Record<CaseStage, BoardCaseItem[]>;
  for (const c of items) {
    if (map[c.stage]) {
      map[c.stage].push(c);
    }
  }
  return map;
}
