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
      {/* Outline-destructive: спокойный красный в покое (текст/рамка), на hover
          заливается сплошным — чтобы рядом с «Редактировать» в тулбаре не кричал. */}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="!border-error/30 !text-error hover:!border-error hover:!bg-error hover:!text-white"
      >
        <Trash2 size={14} strokeWidth={1.75} />
        Удалить
      </Button>
    </form>
  );
}
