'use client';

import { Trash2 } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';
import { deleteAbsenceAction } from '@/lib/absences/actions';

// Удаление отсутствия — с подтверждением (bare server action).
export function DeleteAbsenceButton({
  absenceId,
  userId,
}: {
  absenceId: string;
  userId: string;
}) {
  const { t } = useI18n();
  return (
    <form
      action={deleteAbsenceAction}
      onSubmit={(e) => {
        if (!window.confirm(t.absences.block.deleteConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={absenceId} />
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        aria-label={t.absences.block.delete}
        title={t.absences.block.delete}
        className="inline-flex items-center text-text-subtle transition-colors hover:text-error"
      >
        <Trash2 size={15} strokeWidth={1.75} />
      </button>
    </form>
  );
}
