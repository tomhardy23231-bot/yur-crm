'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { deletePlanItemAction } from '@/lib/payments/actions';

// Удаление позиции графика — с подтверждением (ConfirmDialog, Сессия 5).
export function DeletePlanItemButton({
  caseId,
  itemId,
}: {
  caseId: string;
  itemId: string;
}) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <form ref={formRef} action={deletePlanItemAction}>
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="case_id" value={caseId} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.payments.plan.delete}
        className="inline-flex items-center text-text-subtle transition-colors hover:text-error"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={t.payments.plan.deleteConfirm}
        confirmLabel={t.payments.plan.delete}
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
