import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CaseForm } from '@/components/cases/case-form';
import { updateCaseAction } from '@/lib/cases/actions';
import {
  getCase,
  listClientsForSelect,
  listExpertsForAssignment,
  listLawyersForAssignment,
} from '@/lib/cases/queries';
import { requireUser } from '@/lib/auth/require-role';
import { CASE_STAGES, MANAGER_ROLES, STAFF_ROLES } from '@/lib/types/db';

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [c, clients, lawyers, experts] = await Promise.all([
    getCase(id),
    listClientsForSelect(),
    listLawyersForAssignment(),
    listExpertsForAssignment(),
  ]);

  if (!c) notFound();

  // bind на Server Action сохраняет server-action-маркировку (см. Шаг 4 баг).
  const boundAction = updateCaseAction.bind(null, id);

  // Воронка только вперёд (CLAUDE.md §7-2). Staff видит все 5 этапов,
  // не-staff — текущий и все «вперёд». На БД дополнительно стоит триггер
  // cases_validate_stage_forward, так что UI-фильтр — для UX, не для безопасности.
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  const currentStageIdx = CASE_STAGES.indexOf(c.stage);
  const allowedStages = isStaff
    ? CASE_STAGES
    : CASE_STAGES.slice(currentStageIdx >= 0 ? currentStageIdx : 0);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          href={`/cases/${id}`}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          К карточке дела
        </Link>
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          Редактировать дело
        </h1>
        <p className="text-[13px] text-text-muted truncate">{c.number_title}</p>
      </div>

      <Card className="max-w-3xl p-6 sm:p-8">
        <CaseForm
          action={boundAction}
          caseRow={c}
          clients={clients}
          lawyers={lawyers}
          experts={experts}
          submitLabel="Сохранить"
          cancelHref={`/cases/${id}`}
          allowedStages={allowedStages}
          canEditRates={MANAGER_ROLES.includes(user.profile.role)}
        />
      </Card>
    </main>
  );
}
