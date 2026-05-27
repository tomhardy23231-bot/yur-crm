import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ClientForm } from '@/components/clients/client-form';
import { updateClientAction } from '@/lib/clients/actions';
import { getClient } from '@/lib/clients/queries';
import { requireUser } from '@/lib/auth/require-role';

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const client = await getClient(id);
  if (!client) notFound();

  // .bind() на Server Action возвращает Server Action — можно передать в
  // Client Component. Подставляем clientId первым аргументом; useActionState
  // прокидывает (prev, formData) во второй/третий.
  const boundAction = updateClientAction.bind(null, id);

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12">
      <div className="flex flex-col gap-1">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          К карточке клиента
        </Link>
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          Редактирование клиента
        </h1>
        <p className="text-[13px] text-text-muted">{client.name}</p>
      </div>

      <Card className="max-w-3xl p-6 sm:p-8">
        <ClientForm
          action={boundAction}
          client={client}
          submitLabel="Сохранить изменения"
          cancelHref={`/clients/${id}`}
        />
      </Card>
    </main>
  );
}
