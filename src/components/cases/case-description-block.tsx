'use client';

import { useActionState, useState } from 'react';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  updateCaseDescriptionAction,
  type DescriptionActionState,
} from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';

// ============================================================================
// Блок «Описание дела» (правка владельца 2026-07-14, по каркасу): свободный
// текст + теги. Редактирование inline (textarea), право — как у прочих правок
// дела (canWrite = RLS can_write_case); правка журналируется server action'ом
// как case_updated с diff по description.
// ============================================================================

export function CaseDescriptionBlock({
  caseId,
  description,
  tags,
  canWrite,
}: {
  caseId: string;
  description: string | null;
  tags: string[];
  canWrite: boolean;
}) {
  const { t } = useI18n();
  const d = t.caseCard.description;
  const [editing, setEditing] = useState(false);

  const [state, formAction, pending] = useActionState<DescriptionActionState, FormData>(
    async (prev, fd) => {
      const res = await updateCaseDescriptionAction(caseId, prev, fd);
      if (res.ok) setEditing(false);
      return res;
    },
    { ok: true },
  );

  return (
    <Card className="p-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-extrabold text-text-muted">{d.heading}</h2>
        {canWrite && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Pencil size={12} strokeWidth={2} />
            {d.edit}
          </button>
        )}
      </div>

      {editing ? (
        <form action={formAction} className="flex flex-col gap-2">
          <textarea
            name="description"
            defaultValue={description ?? ''}
            rows={6}
            maxLength={5000}
            placeholder={d.placeholder}
            autoFocus
            className="w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-[13.5px] leading-relaxed text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary-border"
          />
          {!state.ok && state.message && (
            <p role="alert" className="text-[12px] text-error">
              {state.message}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? d.saving : d.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              {d.cancel}
            </Button>
          </div>
        </form>
      ) : description ? (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-muted">
          {description}
        </p>
      ) : (
        <p className="text-[12.5px] text-text-subtle">
          {canWrite ? d.emptyCanWrite : d.empty}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-lg bg-surface-sunken px-2.5 py-1 text-[11.5px] font-medium text-text-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
