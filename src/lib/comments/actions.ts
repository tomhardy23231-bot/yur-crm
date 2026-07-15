'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { dbActionError } from '@/lib/db/errors';
import { rpcLogActivity } from '@/lib/db/rpc';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';

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

  try {
    await userDb(user.profile.id, (tx) =>
      tx.case_comments.create({
        data: { case_id, body, author_id: user.profile.id },
      }),
    );
  } catch (err) {
    // RLS WITH CHECK / can_write_case отрезали запись → throw.
    return {
      ok: false,
      message: dbActionError(
        'createCommentAction',
        err,
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
  const user = await requireUser();
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

  let outcome: 'ok' | 'fail' | 'noop';
  try {
    outcome = await userDb(user.profile.id, async (tx) => {
      // Старый текст — для лога from→to (и чтобы пропустить no-op). RLS SELECT
      // отдаёт только видимые дела; чужой комментарий сюда не попадёт.
      const before = await tx.case_comments.findUnique({
        where: { id: comment_id },
        select: { body: true, case_id: true },
      });
      if (!before) return 'fail';
      // Ничего не изменилось — не трогаем БД и не плодим запись в журнале.
      if (before.body === body) return 'noop';

      // updateMany (не update): чужой UPDATE RLS режет тихо (count:0), без P2025.
      const upd = await tx.case_comments.updateMany({
        where: { id: comment_id },
        data: { body, updated_at: new Date() },
      });
      if (upd.count === 0) return 'fail';

      // Лог правки (с какого на какой). Тексты усекаем под cap log_activity.
      // v3 s2: case_id берём из самой записи (БД), а не из formData — иначе правку
      // можно было бы приписать к другому видимому делу (паттерн «CSO #2»).
      // Ошибку лога глотаем — он не должен ломать саму правку.
      try {
        await rpcLogActivity(tx, {
          entityType: 'case',
          entityId: before.case_id,
          action: 'comment_edited',
          changes: { from: truncForLog(before.body), to: truncForLog(body) },
        });
      } catch {
        /* лог не критичен для основной операции */
      }
      return 'ok';
    });
  } catch (err) {
    return {
      ok: false,
      message: dbActionError(
        'updateCommentAction',
        err,
        t.comments.errors.updateFailed,
        t.errors.db,
      ),
    };
  }

  if (outcome === 'fail') {
    return { ok: false, message: t.comments.errors.updateFailed };
  }

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

// Удалить комментарий. RLS разрешает только автору или owner/admin — серверный
// гейт не дублируем, БД сама отрежет чужой DELETE (вернёт 0 строк).
export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const comment_id = getString(formData, 'comment_id');
  const case_id = getString(formData, 'case_id');
  const backToCase = case_id && UUID_RE.test(case_id) ? `/cases/${case_id}` : null;

  if (!comment_id || !UUID_RE.test(comment_id)) {
    redirect(backToCase ? `${backToCase}?error=missing_id` : '/cases?error=missing_id');
  }

  try {
    await userDb(user.profile.id, (tx) =>
      // deleteMany: чужой DELETE RLS режет тихо (count:0), без P2025 — как прежний
      // no-op на PostgREST. Настоящую ошибку БД ловит catch ниже.
      tx.case_comments.deleteMany({ where: { id: comment_id } }),
    );
  } catch {
    redirect(backToCase ? `${backToCase}?error=delete_failed` : '/cases?error=delete_failed');
  }

  if (backToCase) revalidatePath(backToCase);
}
