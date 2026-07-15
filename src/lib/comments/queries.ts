import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts, tsOrNull } from '@/lib/db/convert';
import type { CaseCommentWithAuthor } from '@/lib/types/db';

// Комментарии дела, новые сверху. RLS отрезает невидимые (наследует доступ дела).
export async function listCommentsByCase(
  caseId: string,
): Promise<CaseCommentWithAuthor[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.case_comments.findMany({
      where: { case_id: caseId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        case_id: true,
        author_id: true,
        body: true,
        created_at: true,
        updated_at: true,
        users: { select: { id: true, full_name: true } },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    author_id: r.author_id,
    body: r.body,
    created_at: ts(r.created_at),
    updated_at: tsOrNull(r.updated_at),
    author: r.users ? { id: r.users.id, full_name: r.users.full_name } : null,
  }));
}
