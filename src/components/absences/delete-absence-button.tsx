'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { deleteAbsenceAction } from '@/lib/absences/actions';

// Удаление отсутствия — с подтверждением (ConfirmDialog, Сессия 5).
export function DeleteAbsenceButton({
  absenceId,
  userId,
}: {
  absenceId: string;
  userId: string;
}) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <form ref={formRef} action={deleteAbsenceAction}>
      <input type="hidden" name="id" value={absenceId} />
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.absences.block.delete}
        title={t.absences.block.delete}
        className="inline-flex items-center text-text-subtle transition-colors hover:text-error"
      >
        <Trash2 size={15} strokeWidth={1.75} />
      </button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={t.absences.block.deleteConfirm}
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
