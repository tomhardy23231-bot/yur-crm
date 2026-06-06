import { MessageSquare } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listCommentsByCase } from '@/lib/comments/queries';

import { CommentForm } from './comment-form';
import { CommentRow } from './comment-row';

interface CaseCommentsBlockProps {
  caseId: string;
  /** Может ли пользователь оставлять комментарии (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Текущий пользователь — чтобы показать «удалить» на своих комментариях. */
  currentUserId: string;
  /** owner/admin — может удалять чужие комментарии (зеркало can_manage_users). */
  isManager: boolean;
}

export async function CaseCommentsBlock({
  caseId,
  canWrite,
  currentUserId,
  isManager,
}: CaseCommentsBlockProps) {
  const { t, plural } = await getT();
  const comments = await listCommentsByCase(caseId);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <MessageSquare size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">
          {t.comments.block.heading}
        </h2>
        <span className="text-[12px] text-text-muted">
          · {plural(t.comments.block.count, comments.length)}
        </span>
      </div>

      {canWrite && (
        <div className="border-b border-border px-5 pt-3 pb-2">
          <CommentForm caseId={caseId} />
        </div>
      )}

      {comments.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <p className="max-w-md text-[13px] text-text-muted">
            {canWrite
              ? t.comments.block.emptyCanWrite
              : t.comments.block.emptyReadonly}
          </p>
        </div>
      ) : (
        <div>
          {comments.map((c) => {
            const mine = c.author_id === currentUserId;
            return (
              <CommentRow
                key={c.id}
                comment={c}
                canDelete={isManager || mine}
                canEdit={isManager || mine}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
