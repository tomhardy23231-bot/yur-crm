import { MessageSquare } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listCommentsByCase } from '@/lib/comments/queries';

import { CommentList } from './comment-list';

interface CaseCommentsBlockProps {
  caseId: string;
  /** Может ли пользователь оставлять комментарии (RLS INSERT = can_write_case). */
  canWrite: boolean;
  /** Текущий пользователь — чтобы показать «удалить» на своих комментариях. */
  currentUserId: string;
  /** Имя текущего пользователя — для оптимистичной «призрак»-записи. */
  currentUserName: string;
  /** owner/admin — может удалять чужие комментарии (зеркало can_manage_users). */
  isManager: boolean;
}

export async function CaseCommentsBlock({
  caseId,
  canWrite,
  currentUserId,
  currentUserName,
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

      {/* Форма + список вынесены в клиентский CommentList (useOptimistic). */}
      <CommentList
        comments={comments}
        caseId={caseId}
        canWrite={canWrite}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        isManager={isManager}
      />
    </Card>
  );
}
