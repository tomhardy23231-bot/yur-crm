'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deleteCaseAction } from '@/lib/cases/actions';

export function DeleteCaseForm({
  caseId,
  caseTitle,
}: {
  caseId: string;
  caseTitle: string;
}) {
  return (
    <form
      action={deleteCaseAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Удалить дело «${caseTitle}»? Операция необратима. Если у дела есть документы или платежи — удаление будет заблокировано.`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="case_id" value={caseId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="!bg-white/15 !border-white/30 !text-white hover:!bg-error/80 hover:!border-error/80"
      >
        <Trash2 size={14} strokeWidth={1.75} />
        Удалить
      </Button>
    </form>
  );
}
