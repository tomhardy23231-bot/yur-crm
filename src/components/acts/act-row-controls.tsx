'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { deleteActAction, setActCompletionAction } from '@/lib/acts/actions';
import { ACT_COMPLETIONS, type ActCompletion } from '@/lib/types/db';

// Удаление неоплаченного акта — с подтверждением (ConfirmDialog, Сессия 5).
export function DeleteActButton({ caseId, actId }: { caseId: string; actId: string }) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <form ref={formRef} action={deleteActAction}>
      <input type="hidden" name="act_id" value={actId} />
      <input type="hidden" name="case_id" value={caseId} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-error transition-colors hover:underline"
      >
        {t.acts.block.delete}
      </button>

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={t.acts.block.deleteConfirm}
        confirmLabel={t.acts.block.delete}
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

// Переопределение отметки выполнения оплаченного акта (staff).
export function ActCompletionForm({
  caseId,
  actId,
  current,
}: {
  caseId: string;
  actId: string;
  current: ActCompletion | null;
}) {
  const { t } = useI18n();
  return (
    <form action={setActCompletionAction} className="flex items-center gap-2">
      <input type="hidden" name="act_id" value={actId} />
      <input type="hidden" name="case_id" value={caseId} />
      <span className="text-[12px] text-text-muted">{t.acts.completion.label}:</span>
      <Select name="completion" defaultValue={current ?? 'full'} className="h-8 w-auto text-[13px]">
        {ACT_COMPLETIONS.map((c) => (
          <option key={c} value={c}>
            {t.enums.actCompletion[c]}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant="secondary">
        {t.acts.completion.save}
      </Button>
    </form>
  );
}
