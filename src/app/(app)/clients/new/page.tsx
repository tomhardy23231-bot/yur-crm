import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ClientForm } from '@/components/clients/client-form';
import { createClientAction } from '@/lib/clients/actions';
import { requireUser } from '@/lib/auth/require-role';

export default async function NewClientPage() {
  // requireUser защищает страницу от незалогиненного пользователя; роль не
  // фильтруем — RLS (clients_insert_active) позволяет создать клиента любому
  // активному сотруднику.
  await requireUser();

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text transition-colors w-fit"
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
          К списку
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <ClientForm
          action={createClientAction}
          submitLabel="Создать клиента"
          cancelHref="/clients"
        />
      </Card>
    </main>
  );
}
