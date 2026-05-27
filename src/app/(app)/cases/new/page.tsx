import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { CaseForm } from '@/components/cases/case-form';
import { createCaseAction } from '@/lib/cases/actions';
import {
  listClientsForSelect,
  listSpecialistsForAssignment,
} from '@/lib/cases/queries';
import { getClient } from '@/lib/clients/queries';
import { requireRole } from '@/lib/auth/require-role';

// В Phase 1 дела заводит admin/owner (RLS-политика cases_insert_staff).
// Для specialist/assistant — /forbidden.
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireRole(['owner', 'admin']);
  const sp = await searchParams;

  const [clients, specialists] = await Promise.all([
    listClientsForSelect(),
    listSpecialistsForAssignment(),
  ]);

  // Если пришли с карточки клиента — фиксируем его в форме.
  const lockedClientRaw = sp.client ? await getClient(sp.client) : null;
  const lockedClient = lockedClientRaw
    ? { id: lockedClientRaw.id, name: lockedClientRaw.name }
    : undefined;

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12">
      <div className="flex flex-col gap-1">
        <Link
          href={lockedClient ? `/clients/${lockedClient.id}` : '/cases'}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {lockedClient ? `К клиенту «${lockedClient.name}»` : 'К списку'}
        </Link>
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          Новое дело
        </h1>
        <p className="text-[13px] text-text-muted">
          Заполните основные данные. Документы, задачи и платежи добавите потом —
          в карточке дела.
        </p>
      </div>

      <Card className="max-w-3xl p-6 sm:p-8">
        <CaseForm
          action={createCaseAction}
          clients={clients}
          lockedClient={lockedClient}
          specialists={specialists}
          submitLabel="Создать дело"
          cancelHref={lockedClient ? `/clients/${lockedClient.id}` : '/cases'}
        />
      </Card>
    </main>
  );
}
