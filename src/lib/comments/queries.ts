import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CaseCommentWithAuthor } from '@/lib/types/db';

// Комментарии дела, новые сверху. RLS отрезает невидимые (наследует доступ дела).
export async function listCommentsByCase(
  caseId: string,
): Promise<CaseCommentWithAuthor[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_comments')
    .select(
      'id, case_id, author_id, body, created_at, updated_at, author:author_id(id, full_name)',
    )
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`listCommentsByCase failed: ${error.message}`);
  }

  type Raw = {
    id: string;
    case_id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string | null;
    author:
      | ReadonlyArray<{ id: string; full_name: string }>
      | { id: string; full_name: string }
      | null;
  };

  return (data ?? []).map((row) => {
    const r = row as Raw;
    const author = Array.isArray(r.author) ? (r.author[0] ?? null) : r.author;
    return {
      id: r.id,
      case_id: r.case_id,
      author_id: r.author_id,
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      author,
    };
  });
}
