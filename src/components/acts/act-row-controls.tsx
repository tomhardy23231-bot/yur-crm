'use client';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { deleteActAction, setActCompletionAction } from '@/lib/acts/actions';
import { ACT_COMPLETIONS, type ActCompletion } from '@/lib/types/db';

// Удаление неоплаченного акта — с подтверждением (bare server action).
export function DeleteActButton({ caseId, actId }: { caseId: string; actId: string }) {
  const { t } = useI18n();
  return (
    <form
      action={deleteActAction}
      onSubmit={(e) => {
        if (!window.confirm(t.acts.block.deleteConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="act_id" value={actId} />
      <input type="hidden" name="case_id" value={caseId} />
      <button
        type="submit"
        className="text-[12px] font-medium text-error transition-colors hover:underline"
      >
        {t.acts.block.delete}
      </button>
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
