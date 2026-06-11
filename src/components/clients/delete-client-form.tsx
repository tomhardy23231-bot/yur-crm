'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <form ref={formRef} action={deleteClientAction}>
      <input type="hidden" name="client_id" value={clientId} />
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} strokeWidth={1.75} />
        {t.common.delete}
      </Button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={fmt(t.clients.delete.confirm, { name: clientName })}
        confirmLabel={t.common.delete}
        tone="danger"
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        onClose={() => setOpen(false)}
      />
    </form>
  );
}
