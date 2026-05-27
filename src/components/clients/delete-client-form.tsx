'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteClientAction } from '@/lib/clients/actions';

export function DeleteClientForm({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  return (
    <form
      action={deleteClientAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Удалить клиента «${clientName}»? Операция необратима. Если у клиента есть дела — удаление будет заблокировано.`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <Button type="submit" variant="destructive" size="sm">
        <Trash2 size={14} strokeWidth={1.75} />
        Удалить
      </Button>
    </form>
  );
}
