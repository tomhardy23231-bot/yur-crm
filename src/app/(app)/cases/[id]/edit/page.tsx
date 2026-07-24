import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { CaseForm } from '@/components/cases/case-form';
import { CaseFormAside } from '@/components/cases/case-form-aside';
import { updateCaseAction } from '@/lib/cases/actions';
import {
  getCase,
  listClientsForSelect,
  listExpertsForAssignment,
  listLawyersForAssignment,
} from '@/lib/cases/queries';
import { listCaseTypesForForm } from '@/lib/cases/case-types';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { allowedStagesFor, STAFF_ROLES, type CaseStage } from '@/lib/types/db';

export default async function EditCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const { id } = await params;

  const [c, clients, lawyers, experts] = await Promise.all([
    getCase(id),
    listClientsForSelect(),
    listLawyersForAssignment(),
    listExpertsForAssignment(),
  ]);

  if (!c) notFound();

  // Типы дел для формы: активные + текущий тип дела (даже если он скрыт).
  const caseTypes = await listCaseTypesForForm(c.case_type);

  // bind на Server Action сохраняет server-action-маркировку (см. Шаг 4 баг).
  const boundAction = updateCaseAction.bind(null, id);

  // Воронка только вперёд (CLAUDE.md §7-2, Задача 8). Staff видит все 5 этапов
  // (может скорректировать), не-staff — только текущий и СЛЕДУЮЩИЙ (без прыжков).
  // На БД дополнительно стоит триггер cases_validate_stage_forward — UI-фильтр
  // лишь для UX, не для безопасности.
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  // Дело в архиве (archived_at != null) всегда closed. Этап в форме блокируем
  // на 'closed' (одна опция) + подсказка — иначе смена этапа упрётся в CHECK
  // cases_archived_requires_closed. Прочие поля архивного дела править можно.
  const isArchived = c.archived_at != null;
  const allowedStages: ReadonlyArray<CaseStage> = isArchived
    ? ['closed']
    : allowedStagesFor(c.stage, isStaff);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          href={`/cases/${id}`}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {t.caseCard.edit.backToCase}
        </Link>
        <p className="text-[13px] text-text-muted truncate">{c.number_title}</p>
      </div>

      {/* Секции формы — сами карточки (редизайн 14.07); справа — помощник. */}
      <div className="grid w-full grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-5">
        <div className="min-w-0">
          <CaseForm
            action={boundAction}
            caseRow={c}
            clients={clients}
            lawyers={lawyers}
            experts={experts}
            caseTypes={caseTypes}
            submitLabel={t.common.save}
            cancelHref={`/cases/${id}`}
            allowedStages={allowedStages}
            stageLockedHint={isArchived ? t.cases.archive.detailHint : undefined}
            isStaff={isStaff}
            canEditRates={user.caps.edit_rate_overrides}
            canCreateClient={user.caps.create_clients}
          />
        </div>
        <CaseFormAside />
      </div>
    </main>
  );
}
