'use client';

import { Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { useI18n } from '@/lib/i18n/provider';
import { deleteCommentAction } from '@/lib/comments/actions';
import type { CaseCommentWithAuthor } from '@/lib/types/db';

const DT_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface CommentRowProps {
  comment: CaseCommentWithAuthor;
  /** Можно ли удалить (автор своей записи или owner/admin) — зеркало RLS. */
  canDelete: boolean;
}

export function CommentRow({ comment, canDelete }: CommentRowProps) {
  const { t } = useI18n();
  const name = comment.author?.full_name ?? t.comments.row.unknownAuthor;

  return (
    <div className="group flex items-start gap-3 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-muted/40">
      <Avatar name={name} size="md" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <span className="font-mono text-[11.5px] tabular-nums text-text-subtle">
            {DT_FMT.format(new Date(comment.created_at))}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-text-muted">
          {comment.body}
        </p>
      </div>

      {canDelete && (
        <form action={deleteCommentAction} className="shrink-0">
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
  );
}
