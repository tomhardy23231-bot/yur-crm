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
import { getT } from '@/lib/i18n/server';
import {
  CASE_STAGES,
  CASE_TYPES,
  STAFF_ROLES,
  type CaseType,
  type CaseStage,
} from '@/lib/types/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}

export default async function CasesBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    responsible?: string;
  }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const caseType = sp.type && isCaseType(sp.type) ? sp.type : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;

  const isStaff = STAFF_ROLES.includes(user.profile.role);

  const experts = isStaff ? await listExpertsForAssignment() : [];
  const all = await listCasesForBoard({ caseType, responsibleId });

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

  // Строит href обратно на список с теми же фильтрами.
  function listHref(): string {
    const params = new URLSearchParams();
    if (caseType) params.set('type', caseType);
    if (responsibleId) params.set('responsible', responsibleId);
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
          options={[
            { value: '', label: t.cases.filters.allTypes },
            ...CASE_TYPES.map((ct) => ({
              value: ct,
              label: t.enums.caseType[ct],
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
        {(caseType || responsibleId) && (
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
