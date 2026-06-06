'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BODY_MAX = 5000;

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export type CommentActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: { body?: string };
};

// Добавить комментарий к делу. RLS WITH CHECK требует author_id = active_uid()
// и право писать в дело (can_write_case) — ставим author_id явно из сессии.
export async function createCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await requireUser();
  const { t } = await getT();

  const case_id = getString(formData, 'case_id');
  const body = getString(formData, 'body');

  if (!case_id || !UUID_RE.test(case_id)) {
    return { ok: false, message: t.comments.errors.invalidCase };
  }
  if (!body) {
    return { ok: false, fieldErrors: { body: t.comments.errors.empty } };
  }
  if (body.length > BODY_MAX) {
    return { ok: false, fieldErrors: { body: t.comments.errors.tooLong } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('case_comments').insert({
    case_id,
    body,
    author_id: user.profile.id,
  });

  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(
        'createCommentAction',
        error,
        t.comments.errors.createFailed,
        t.errors.db,
      ),
    };
  }

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// Удалить комментарий. RLS разрешает только автору или owner/admin — серверный
// гейт не дублируем, БД сама отрежет чужой DELETE (вернёт 0 строк / ошибку).
export async function deleteCommentAction(formData: FormData): Promise<void> {
  await requireUser();

  const comment_id = getString(formData, 'comment_id');
  const case_id = getString(formData, 'case_id');
  const backToCase = case_id && UUID_RE.test(case_id) ? `/cases/${case_id}` : null;

  if (!comment_id || !UUID_RE.test(comment_id)) {
    redirect(backToCase ? `${backToCase}?error=missing_id` : '/cases?error=missing_id');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('case_comments')
    .delete()
    .eq('id', comment_id);

  if (error) {
    redirect(backToCase ? `${backToCase}?error=delete_failed` : '/cases?error=delete_failed');
  }

  if (backToCase) revalidatePath(backToCase);
}
