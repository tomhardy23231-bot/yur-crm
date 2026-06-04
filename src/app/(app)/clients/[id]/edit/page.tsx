import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ClientForm } from '@/components/clients/client-form';
import { updateClientAction } from '@/lib/clients/actions';
import { getClient } from '@/lib/clients/queries';
import { requireUser } from '@/lib/auth/require-role';
import { isStaff } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const { id } = await params;

  const client = await getClient(id);
  if (!client) notFound();

  // Править клиента может staff или автор записи (created_by). Юрист/Експерт
  // видят клиента по своему делу, но редактировать чужого не вправе — RLS
  // молча отклонит UPDATE, поэтому не показываем форму вовсе (иначе ложный
  // «сохранено»). Зеркалит canEdit на карточке клиента. (Аудит P2.3.)
  if (!isStaff(user.profile.role) && client.created_by !== user.profile.id) {
    redirect('/forbidden');
  }

  // .bind() на Server Action возвращает Server Action — можно передать в
  // Client Component. Подставляем clientId первым аргументом; useActionState
  // прокидывает (prev, formData) во второй/третий.
  const boundAction = updateClientAction.bind(null, id);

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          {t.clients.edit.backToCard}
        </Link>
        <p className="text-[13px] text-text-muted">{client.name}</p>
      </div>

      <Card className="p-6 sm:p-8">
        <ClientForm
          action={boundAction}
          client={client}
          submitLabel={t.clients.edit.submit}
          cancelHref={`/clients/${id}`}
        />
      </Card>
    </main>
  );
}
