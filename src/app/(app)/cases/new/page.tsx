import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { CaseForm } from '@/components/cases/case-form';
import { CaseFormAside } from '@/components/cases/case-form-aside';
import { createCaseAction } from '@/lib/cases/actions';
import {
  listClientsForSelect,
  listExpertsForAssignment,
  listLawyersForAssignment,
} from '@/lib/cases/queries';
import { listCaseTypesForForm } from '@/lib/cases/case-types';
import { getClient } from '@/lib/clients/queries';
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';

// Дела заводит staff: owner/admin/office_manager (RLS-политика cases_insert_staff).
// Для юриста/Експерта — /forbidden.
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const user = await requireCap('create_cases');
  const { t, fmt } = await getT();
  const canEditRates = user.caps.edit_rate_overrides;
  const sp = await searchParams;

  const [clients, lawyers, experts, caseTypes] = await Promise.all([
    listClientsForSelect(),
    listLawyersForAssignment(),
    listExpertsForAssignment(),
    listCaseTypesForForm(),
  ]);

  // Если пришли с карточки клиента — фиксируем его в форме.
  const lockedClientRaw = sp.client ? await getClient(sp.client) : null;
  const lockedClient = lockedClientRaw
    ? { id: lockedClientRaw.id, name: lockedClientRaw.name }
    : undefined;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          href={lockedClient ? `/clients/${lockedClient.id}` : '/cases'}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {lockedClient
            ? fmt(t.caseCard.create.backToClient, { name: lockedClient.name })
            : t.caseCard.create.backToList}
        </Link>
      </div>

      {/* Секции формы — сами карточки (редизайн 14.07); справа на широких
          экранах — сайдбар-помощник (ставки, роли, «что дальше»). */}
      <div className="grid w-full grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-5">
        <div data-tour="case-form" className="min-w-0">
          <CaseForm
            action={createCaseAction}
            clients={clients}
            lockedClient={lockedClient}
            lawyers={lawyers}
            experts={experts}
            caseTypes={caseTypes}
            submitLabel={t.caseCard.create.submit}
            cancelHref={lockedClient ? `/clients/${lockedClient.id}` : '/cases'}
            canEditRates={canEditRates}
            canCreateClient={user.caps.create_clients}
          />
        </div>
        <CaseFormAside />
      </div>
    </main>
  );
}
