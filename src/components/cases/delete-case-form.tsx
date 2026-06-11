'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteCaseAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';

export function DeleteCaseForm({
  caseId,
  caseTitle,
}: {
  caseId: string;
  caseTitle: string;
}) {
  const { t, fmt } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <form ref={formRef} action={deleteCaseAction}>
      <input type="hidden" name="case_id" value={caseId} />
      {/* Outline-destructive: спокойный красный в покое (текст/рамка), на hover
          заливается сплошным — чтобы рядом с «Редактировать» в тулбаре не кричал. */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="!border-error/30 !text-error hover:!border-error hover:!bg-error hover:!text-white"
      >
        <Trash2 size={14} strokeWidth={1.75} />
        {t.caseCard.delete.button}
      </Button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={fmt(t.caseCard.delete.confirm, { title: caseTitle })}
        confirmLabel={t.caseCard.delete.button}
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
