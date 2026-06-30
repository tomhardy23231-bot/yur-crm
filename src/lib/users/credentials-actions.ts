'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { UUID_RE } from '@/lib/validation';
import type { Role } from '@/lib/types/db';

// ============================================================================
// Управление доступами сотрудника ВЛАДЕЛЬЦЕМ (модалка «логин/пароль» в строке
// списка /settings/users). Все экшены — строго owner-only (проверка в коде +
// owner-gated DEFINER-функции в БД: get/set_user_login_secret, user_delete_blockers).
//
// Текущий пароль из auth показать нельзя (хеш). Поэтому владелец задаёт/генерирует
// пароль, а мы храним его ЗЕРКАЛО (private.user_login_secrets, зашифровано) — оно
// и показывается. Источник истины для входа остаётся auth.users.
// ============================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Читаемый разовый пароль (префикс + 12 hex от crypto). Достаточно стойкий,
// при этом владельцу удобно продиктовать/скопировать.
function genPassword(): string {
  return `Yur-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// owner-гейт. requireUser редиректит неавторизованного; не-owner — мягкий отказ.
async function ownerOrError<T extends { ok: false; error: string }>(
  build: (msg: string) => T,
): Promise<{ actor: Awaited<ReturnType<typeof requireUser>> } | T> {
  const actor = await requireUser();
  if (actor.profile.role !== 'owner') {
    const { t } = await getT();
    return build(t.users.errors.notOwner);
  }
  return { actor };
}

export type UserCredentials = {
  email: string;
  fullName: string;
  // Зеркало последнего пароля, выданного через панель (null — ещё не выдавался).
  password: string | null;
  passwordUpdatedAt: string | null;
};

export type GetCredentialsResult =
  | { ok: true; data: UserCredentials }
  | { ok: false; error: string };

export type PasswordResult =
  | { ok: true; password: string }
  | { ok: false; error: string };

export type EmailChangeResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export type InviteResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export type DeleteBlockers = {
  can_delete: boolean;
  total: number;
  cases: number;
  clients: number;
  payments: number;
  documents: number;
  tasks: number;
  acts: number;
  comments: number;
  cash: number;
  payroll: number;
};

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; error: string; blockers?: DeleteBlockers };

// ── Чтение логина + зеркала пароля ──────────────────────────────────────────
export async function getUserCredentialsAction(
  userId: string,
): Promise<GetCredentialsResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }

  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('id', userId)
    .maybeSingle<{ id: string; full_name: string; email: string | null }>();
  if (!u) return { ok: false, error: t.users.errors.userNotFound };

  let password: string | null = null;
  let passwordUpdatedAt: string | null = null;
  const { data: sec, error: secErr } = await supabase.rpc('get_user_login_secret', {
    p_user_id: userId,
  });
  if (!secErr && Array.isArray(sec) && sec.length > 0) {
    password = (sec[0] as { password: string | null }).password ?? null;
    passwordUpdatedAt =
      (sec[0] as { updated_at: string | null }).updated_at ?? null;
  }

  return {
    ok: true,
    data: {
      email: u.email ?? '',
      fullName: u.full_name,
      password,
      passwordUpdatedAt,
    },
  };
}

// ── Выдать новый (случайный) пароль ─────────────────────────────────────────
export async function reissueUserPasswordAction(
  userId: string,
): Promise<PasswordResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }

  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle<{ id: string }>();
  if (!u) return { ok: false, error: t.users.errors.userNotFound };

  const password = genPassword();
  const admin = createSupabaseAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    password,
  });
  if (authErr) {
    console.error('[reissueUserPassword]', authErr.message);
    return { ok: false, error: t.users.errors.updatePasswordFailed };
  }

  // Зеркало для показа владельцу (owner-gated DEFINER под сессией владельца).
  const { error: secErr } = await supabase.rpc('set_user_login_secret', {
    p_user_id: userId,
    p_password: password,
  });
  if (secErr) console.error('[reissueUserPassword.mirror]', secErr.message);

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_password_reset',
    changes: {},
  });
  revalidatePath('/settings/users');
  return { ok: true, password };
}

// ── Задать конкретный пароль (владелец вводит свой) ──────────────────────────
export async function setUserPasswordAction(
  userId: string,
  password: string,
): Promise<PasswordResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }
  const pw = password ?? '';
  if (pw.length < 8) return { ok: false, error: t.users.errors.passwordTooShort };
  if (pw.length > 72) return { ok: false, error: t.users.errors.passwordTooLong };

  const admin = createSupabaseAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    password: pw,
  });
  if (authErr) {
    console.error('[setUserPassword]', authErr.message);
    return { ok: false, error: t.users.errors.updatePasswordFailed };
  }

  const supabase = await createSupabaseServerClient();
  const { error: secErr } = await supabase.rpc('set_user_login_secret', {
    p_user_id: userId,
    p_password: pw,
  });
  if (secErr) console.error('[setUserPassword.mirror]', secErr.message);

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_password_reset',
    changes: {},
  });
  revalidatePath('/settings/users');
  return { ok: true, password: pw };
}

// ── Изменить логин (email) ───────────────────────────────────────────────────
export async function changeUserEmailAction(
  userId: string,
  newEmail: string,
): Promise<EmailChangeResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }
  const email = (newEmail ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, error: t.users.errors.invalidEmail };
  }

  const admin = createSupabaseAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (authErr) {
    if (/already|exist|registered/i.test(authErr.message)) {
      return { ok: false, error: t.users.errors.emailExists };
    }
    console.error('[changeUserEmail]', authErr.message);
    return { ok: false, error: t.users.errors.updateEmailFailed };
  }

  // Зеркалим email в public.users (источник истины для входа — auth, но в
  // приложении email читается из профиля). RLS owner-update разрешён.
  const supabase = await createSupabaseServerClient();
  const { error: profErr } = await supabase
    .from('users')
    .update({ email })
    .eq('id', userId);
  if (profErr) console.error('[changeUserEmail.profile]', profErr.message);

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_email_changed',
    changes: { email },
  });
  revalidatePath('/settings/users');
  return { ok: true, email };
}

// ── Отправить приглашение на email (встроенная почта Supabase) ───────────────
// Письмо «восстановления пароля»: сотрудник по ссылке попадает в систему и
// задаёт свой пароль. Ссылка обрабатывается /auth/confirm.
export async function sendUserInviteAction(
  userId: string,
): Promise<InviteResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }

  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle<{ id: string; email: string | null }>();
  if (!u?.email) return { ok: false, error: t.users.errors.userNotFound };

  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const redirectTo = `${proto}://${host}/auth/confirm?next=/profile`;

  const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
    redirectTo,
  });
  if (error) {
    console.error('[sendUserInvite]', error.message);
    return { ok: false, error: t.users.errors.inviteFailed };
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_invited',
    changes: { email: u.email },
  });
  return { ok: true, email: u.email };
}

// ── Удаление сотрудника (умное: чистые учётки — насовсем, с историей — блок) ──
export async function deleteUserAction(
  userId: string,
): Promise<DeleteUserResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { actor } = gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }
  if (userId === actor.profile.id) {
    return { ok: false, error: t.users.errors.cannotSelf };
  }

  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase
    .from('users')
    .select('id, email, role, full_name')
    .eq('id', userId)
    .maybeSingle<{
      id: string;
      email: string | null;
      role: Role;
      full_name: string;
    }>();
  if (!u) return { ok: false, error: t.users.errors.userNotFound };

  // Превентивная проверка истории (дружелюбное сообщение). Реальный страж — FK.
  const { data: blk, error: blkErr } = await supabase.rpc('user_delete_blockers', {
    p_user_id: userId,
  });
  if (blkErr) {
    console.error('[deleteUser.blockers]', blkErr.message);
    return { ok: false, error: t.users.errors.deleteFailed };
  }
  const blockers = blk as DeleteBlockers;
  if (!blockers?.can_delete) {
    return { ok: false, error: t.users.errors.deleteBlocked, blockers };
  }

  // Чистая учётка → удаляем из auth (каскадом снимется public.users + зеркало).
  const admin = createSupabaseAdminClient();
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    // Гонка: история появилась между проверкой и удалением → FK не дал. Безопасно.
    console.error('[deleteUser]', delErr.message);
    return { ok: false, error: t.users.errors.deleteFailed, blockers };
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_deleted',
    changes: { email: u.email, role: u.role, full_name: u.full_name },
  });
  revalidatePath('/settings/users');
  return { ok: true };
}
