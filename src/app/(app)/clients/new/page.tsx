import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ClientForm } from '@/components/clients/client-form';
import { createClientAction } from '@/lib/clients/actions';
import { requireUser } from '@/lib/auth/require-role';

export default async function NewClientPage() {
  // requireUser защищает страницу от незалогиненного пользователя; роль не
  // фильтруем — RLS позволит создать клиента всем, кроме assistant (см. политики).
  await requireUser();

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          К списку
        </Link>
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
          Новый клиент
        </h1>
        <p className="text-[13px] text-text-muted">
          После создания вы попадёте в карточку — оттуда можно завести дело и
          загружать документы.
        </p>
      </div>

      <Card className="max-w-3xl p-6 sm:p-8">
        <ClientForm
          action={createClientAction}
          submitLabel="Создать клиента"
          cancelHref="/clients"
        />
      </Card>
    </main>
  );
}
