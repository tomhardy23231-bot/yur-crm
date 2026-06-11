'use client';

import { useOptimistic } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import type { CaseCommentWithAuthor } from '@/lib/types/db';

import { CommentForm } from './comment-form';
import { CommentRow } from './comment-row';

// Клиентская обёртка списка комментариев: форма + список под одним useOptimistic,
// чтобы новый комментарий появлялся СРАЗУ (полупрозрачной «призрак»-строкой),
// не дожидаясь round-trip + revalidate. После ответа сервера revalidate приносит
// реальный список, и useOptimistic ребейзится на него (дубля не будет).
type OptimisticComment = CaseCommentWithAuthor & { pending?: boolean };

interface CommentListProps {
  comments: CaseCommentWithAuthor[];
  caseId: string;
  canWrite: boolean;
  currentUserId: string;
  /** Имя текущего пользователя — для аватара/подписи оптимистичной записи. */
  currentUserName: string;
  /** owner/admin — может удалять/править чужие комментарии. */
  isManager: boolean;
}

export function CommentList({
  comments,
  caseId,
  canWrite,
  currentUserId,
  currentUserName,
  isManager,
}: CommentListProps) {
  const { t } = useI18n();

  // Новые сверху (как сортирует listCommentsByCase) → prepend. id генерится в
  // вызывающем (comment-form) и приходит в payload — стабилен между повторными
  // применениями reducer (генерить внутри reducer нельзя: ключ менялся бы на
  // каждом ре-рендере → ремоунт строки).
  const [optimistic, addOptimistic] = useOptimistic(
    comments as OptimisticComment[],
    (state, input: { id: string; body: string }) => [
      {
        id: input.id,
        case_id: caseId,
        author_id: currentUserId,
        body: input.body,
        created_at: new Date().toISOString(),
        updated_at: null,
        author: { id: currentUserId, full_name: currentUserName },
        pending: true,
      },
      ...state,
    ],
  );

  return (
    <>
      {canWrite && (
        <div className="border-b border-border px-5 pt-3 pb-2">
          <CommentForm caseId={caseId} addOptimistic={addOptimistic} />
        </div>
      )}

      {optimistic.length === 0 ? (
        <EmptyState
          title={
            canWrite
              ? t.comments.block.emptyCanWrite
              : t.comments.block.emptyReadonly
          }
        />
      ) : (
        <div>
          {optimistic.map((c) =>
            c.pending ? (
              <PendingRow
                key={c.id}
                name={c.author?.full_name ?? currentUserName}
                body={c.body}
                label={t.comments.form.submitting}
              />
            ) : (
              <CommentRow
                key={c.id}
                comment={c}
                canDelete={isManager || c.author_id === currentUserId}
                canEdit={isManager || c.author_id === currentUserId}
              />
            ),
          )}
        </div>
      )}
    </>
  );
}

// «Призрак» отправляемого комментария: та же раскладка, что у CommentRow, но
// полупрозрачная, без действий и с пометкой «сохраняется…».
function PendingRow({
  name,
  body,
  label,
}: {
  name: string;
  body: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-5 py-3 opacity-60 last:border-b-0">
      <Avatar name={name} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <span className="text-[11.5px] italic text-text-subtle">{label}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] font-medium leading-[1.55] text-text">
          {body}
        </p>
      </div>
    </div>
  );
}
