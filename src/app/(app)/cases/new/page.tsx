import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CaseForm } from '@/components/cases/case-form';
import { createCaseAction } from '@/lib/cases/actions';
import {
  listClientsForSelect,
  listExpertsForAssignment,
  listLawyersForAssignment,
} from '@/lib/cases/queries';
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

  const [clients, lawyers, experts] = await Promise.all([
    listClientsForSelect(),
    listLawyersForAssignment(),
    listExpertsForAssignment(),
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

      <Card data-tour="case-form" className="p-4 sm:p-6 lg:p-8">
        <CaseForm
          action={createCaseAction}
          clients={clients}
          lockedClient={lockedClient}
          lawyers={lawyers}
          experts={experts}
          submitLabel={t.caseCard.create.submit}
          cancelHref={lockedClient ? `/clients/${lockedClient.id}` : '/cases'}
          canEditRates={canEditRates}
          canCreateClient={user.caps.create_clients}
        />
      </Card>
    </main>
  );
}
