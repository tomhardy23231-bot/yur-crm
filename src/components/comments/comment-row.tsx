'use client';

import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/provider';
import {
  deleteCommentAction,
  updateCommentAction,
  type CommentActionState,
} from '@/lib/comments/actions';
import type { CaseCommentWithAuthor } from '@/lib/types/db';

const DT_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const INITIAL: CommentActionState = { ok: false };

interface CommentRowProps {
  comment: CaseCommentWithAuthor;
  /** Можно ли удалить (автор своей записи или owner/admin) — зеркало RLS. */
  canDelete: boolean;
  /** Можно ли редактировать (автор или owner/admin) — зеркало UPDATE-политики. */
  canEdit: boolean;
}

export function CommentRow({ comment, canDelete, canEdit }: CommentRowProps) {
  const { t, fmt } = useI18n();
  const name = comment.author?.full_name ?? t.comments.row.unknownAuthor;
  const [editing, setEditing] = useState(false);

  return (
    <div className="group flex items-start gap-3 border-b border-border px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-muted/40">
      <Avatar name={name} size="md" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <span className="text-[11.5px] tabular-nums text-text-subtle">
            {DT_FMT.format(new Date(comment.created_at))}
          </span>
          {comment.updated_at && (
            <span
              className="text-[11px] italic text-text-subtle"
              title={fmt(t.comments.row.editedTitle, {
                date: DT_FMT.format(new Date(comment.updated_at)),
              })}
            >
              ({t.comments.row.edited})
            </span>
          )}
        </div>

        {editing ? (
          <EditForm
            comment={comment}
            onDone={() => setEditing(false)}
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] font-medium leading-[1.55] text-text">
            {comment.body}
          </p>
        )}
      </div>

      {/* Действия (правка/удаление) — только когда не в режиме редактирования. */}
      {!editing && (canEdit || canDelete) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t.comments.row.editAria}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-primary-subtle hover:text-primary focus:opacity-100 group-hover:opacity-100"
            >
              <Pencil size={14} strokeWidth={1.75} />
            </button>
          )}
          {canDelete && (
            <form action={deleteCommentAction}>
              <input type="hidden" name="comment_id" value={comment.id} />
              <input type="hidden" name="case_id" value={comment.case_id} />
              <button
                type="submit"
                aria-label={t.comments.row.deleteAria}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-subtle opacity-0 transition-opacity hover:bg-error-bg hover:text-error focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Инлайн-форма правки тела комментария. На успехе — выходим из режима.
function EditForm({
  comment,
  onDone,
}: {
  comment: CaseCommentWithAuthor;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [state, formAction] = useActionState<CommentActionState, FormData>(
    updateCommentAction,
    INITIAL,
  );
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Автофокус в конец текста при входе в редактирование.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-1.5 flex flex-col gap-2">
      <input type="hidden" name="comment_id" value={comment.id} />
      <input type="hidden" name="case_id" value={comment.case_id} />
      <Textarea
        ref={taRef}
        name="body"
        defaultValue={comment.body}
        rows={2}
        required
        maxLength={5000}
        className="min-h-[56px]"
        aria-invalid={state.fieldErrors?.body ? 'true' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
        }}
      />
      {(state.fieldErrors?.body || (state.message && !state.ok)) && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {state.fieldErrors?.body ?? state.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <SaveButton label={t.comments.edit.save} savingLabel={t.comments.edit.saving} />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          <X size={14} strokeWidth={2} />
          {t.comments.edit.cancel}
        </Button>
      </div>
    </form>
  );
}

function SaveButton({
  label,
  savingLabel,
}: {
  label: string;
  savingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Check size={14} strokeWidth={2} />
      {pending ? savingLabel : label}
    </Button>
  );
}
