'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import {
  createCommentAction,
  type CommentActionState,
} from '@/lib/comments/actions';

const INITIAL: CommentActionState = { ok: false };

// Поле комментария: всегда видимо на карточке (не в details, как форма задачи) —
// заметку оставляют часто. После успешной отправки очищаем textarea.
export function CommentForm({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<CommentActionState, FormData>(
    createCommentAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="case_id" value={caseId} />
      {/* Компактнее, чем дефолтные 88px: 2 строки; при необходимости тянется. */}
      <Textarea
        name="body"
        rows={2}
        required
        maxLength={5000}
        placeholder={t.comments.form.placeholder}
        aria-invalid={state.fieldErrors?.body ? 'true' : undefined}
        className="min-h-[56px]"
      />

      {state.fieldErrors?.body && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {state.fieldErrors.body}
        </p>
      )}
      {state.message && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-[12px] text-error"
        >
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton
          label={t.comments.form.submit}
          savingLabel={t.comments.form.submitting}
        />
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  savingLabel,
}: {
  label: string;
  savingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? savingLabel : label}
    </Button>
  );
}
