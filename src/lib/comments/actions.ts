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

// Сколько символов от старого/нового текста кладём в activity_log.changes.
// Лог — для аудита «что на что», а не полная копия (cap log_activity = 8 КБ).
const LOG_BODY_TRUNC = 1000;

function truncForLog(s: string): string {
  return s.length > LOG_BODY_TRUNC ? `${s.slice(0, LOG_BODY_TRUNC)}…` : s;
}

// Редактировать комментарий. RLS UPDATE разрешает автору или owner/admin (миграция
// 20260606140000); серверный гейт не дублируем — БД отрежет чужой UPDATE (0 строк).
// Правку логируем в activity_log (action 'comment_edited', changes={from,to}).
export async function updateCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  await requireUser();
  const { t } = await getT();

  const comment_id = getString(formData, 'comment_id');
  const case_id = getString(formData, 'case_id');
  const body = getString(formData, 'body');

  if (!case_id || !UUID_RE.test(case_id) || !comment_id || !UUID_RE.test(comment_id)) {
    return { ok: false, message: t.comments.errors.invalidCase };
  }
  if (!body) {
    return { ok: false, fieldErrors: { body: t.comments.errors.empty } };
  }
  if (body.length > BODY_MAX) {
    return { ok: false, fieldErrors: { body: t.comments.errors.tooLong } };
  }

  const supabase = await createSupabaseServerClient();

  // Старый текст — для лога from→to (и чтобы пропустить no-op). RLS SELECT
  // отдаёт только видимые дела; чужой комментарий сюда не попадёт.
  const { data: before } = await supabase
    .from('case_comments')
    .select('body')
    .eq('id', comment_id)
    .maybeSingle<{ body: string }>();

  if (!before) {
    return { ok: false, message: t.comments.errors.updateFailed };
  }
  // Ничего не изменилось — не трогаем БД и не плодим запись в журнале.
  if (before.body === body) return { ok: true };

  const { data: updated, error } = await supabase
    .from('case_comments')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', comment_id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error || !updated) {
    return {
      ok: false,
      message: dbErrorMessage(
        'updateCommentAction',
        error ?? { message: 'rls_blocked' },
        t.comments.errors.updateFailed,
        t.errors.db,
      ),
    };
  }

  // Лог правки (с какого на какой). Тексты усекаем под cap log_activity.
  // Ошибку лога глотаем — он не должен ломать саму правку (log_activity и сам
  // не пробрасывает исключений, но rpc-вызов оборачиваем на всякий случай).
  try {
    await supabase.rpc('log_activity', {
      p_entity_type: 'case',
      p_entity_id: case_id,
      p_action: 'comment_edited',
      p_changes: { from: truncForLog(before.body), to: truncForLog(body) },
    });
  } catch {
    /* лог не критичен для основной операции */
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
