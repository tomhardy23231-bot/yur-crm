'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { deleteClientAction } from '@/lib/clients/actions';

export function DeleteClientForm({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { t, fmt } = useI18n();
  return (
    <form
      action={deleteClientAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          fmt(t.clients.delete.confirm, { name: clientName }),
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <Button type="submit" variant="destructive" size="sm">
        <Trash2 size={14} strokeWidth={1.75} />
        {t.common.delete}
      </Button>
    </form>
  );
}
