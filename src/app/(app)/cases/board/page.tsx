import Link from 'next/link';
import { List, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BoardColumn } from '@/components/cases/board-column';
import { CasesFilterSelect } from '@/components/cases/cases-filter-select';
import { requireUser } from '@/lib/auth/require-role';
import {
  listCasesForBoard,
  listSpecialistsForAssignment,
  type BoardCaseItem,
} from '@/lib/cases/queries';
import {
  CASE_STAGES,
  CASE_STAGE_LABEL,
  CASE_TYPES,
  CASE_TYPE_LABEL,
  type CaseStage,
  type CaseType,
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
  const sp = await searchParams;
  const caseType = sp.type && isCaseType(sp.type) ? sp.type : undefined;
  const responsibleId =
    sp.responsible && UUID_RE.test(sp.responsible) ? sp.responsible : undefined;

  const isStaff =
    user.profile.role === 'owner' || user.profile.role === 'admin';

  const specialists = isStaff ? await listSpecialistsForAssignment() : [];
  const all = await listCasesForBoard({ caseType, responsibleId });

  // Группируем дела по этапу. Order сохраняется из запроса (priority asc → opened_at desc).
  const grouped = groupByStage(all);

  // Право двигать дело вперёд: staff (owner/admin) — любое; specialist — только
  // где responsible_id = я; assistant — read-only (по CLAUDE.md §4).
  // RLS уже отфильтровал, что видно; здесь — что можно ИЗМЕНИТЬ.
  function canAdvanceFor(c: BoardCaseItem): boolean {
    if (user.profile.role === 'owner' || user.profile.role === 'admin') return true;
    if (user.profile.role === 'specialist') {
      return c.responsible?.id === user.profile.id;
    }
    return false; // assistant
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
    <main className="flex flex-col gap-5 px-8 py-10 sm:px-12 min-h-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Доска дел
          </h1>
          <p className="text-[13px] text-text-muted">
            Воронка 8 этапов · движение только вперёд · {all.length}{' '}
            {plural(all.length, ['дело', 'дела', 'дел'])}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={listHref()}>
              <List size={14} strokeWidth={1.75} />
              Список
            </Link>
          </Button>
          {isStaff && (
            <Button asChild size="sm">
              <Link href="/cases/new">
                <Plus size={14} strokeWidth={2} />
                Новое дело
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
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
        {(caseType || responsibleId) && (
          <Link
            href="/cases/board"
            className="text-[13px] text-text-muted hover:text-text underline-offset-2 hover:underline"
          >
            Сбросить
          </Link>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
        {CASE_STAGES.map((stage, idx) => {
          const nextStage = CASE_STAGES[idx + 1] ?? null;
          const nextStageLabel = nextStage ? CASE_STAGE_LABEL[nextStage] : null;
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

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}
