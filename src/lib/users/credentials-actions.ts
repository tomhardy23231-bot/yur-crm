'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { getT } from '@/lib/i18n/server';
import { userDb } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import {
  rpcGetUserLoginSecret,
  rpcSetUserLoginSecret,
  rpcUserDeleteBlockers,
} from '@/lib/db/rpc';
import { Prisma } from '@/generated/prisma/client';
import { generateTempPassword } from '@/lib/users/temp-password';
import { UUID_RE } from '@/lib/validation';
import type { Role } from '@/lib/types/db';

// ============================================================================
// Управление доступами сотрудника ВЛАДЕЛЬЦЕМ (модалка «логин/пароль» в строке
// списка /settings/users). Все экшены — строго owner-only (проверка в коде +
// owner-gated DEFINER-функции в БД: get/set_user_login_secret, user_delete_blockers).
//
// Цикл v4: auth.users — наша таблица, пароли пишем сами (bcrypt) через
// admin-пул; каждая смена пароля инкрементит public.users.pwd_version —
// все сессии сотрудника отзываются мгновенно (ревью V2). Зеркало пароля
// (private.user_login_secrets) и его показ владельцу работают как раньше.
//
// Email-приглашения (прежний resetPasswordForEmail + /auth/confirm) удалены —
// СВОЯ отправка почты приедет в сессии 8 (решение ревью D1); до неё выдача
// доступов — копи-блоком «логин+пароль» (основной флоу и раньше).
// ============================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2002' ||
      (err.code === 'P2010' &&
        String((err.meta as { code?: unknown } | undefined)?.code) === '23505'))
  );
}

// Смена пароля сотрудника: bcrypt-хеш в auth.users + инкремент pwd_version
// (отзыв всех его сессий) — одной транзакцией admin-пула.
async function writePassword(userId: string, password: string): Promise<void> {
  const db = adminDb();
  const hash = await bcrypt.hash(password, 10);
  await db.$transaction([
    db.auth_users.update({
      where: { id: userId },
      data: {
        encrypted_password: hash,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date(),
      },
    }),
    db.public_users.update({
      where: { id: userId },
      data: { pwd_version: { increment: 1 } },
    }),
  ]);
}

// ── Чтение логина + зеркала пароля ──────────────────────────────────────────
export async function getUserCredentialsAction(
  userId: string,
): Promise<GetCredentialsResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { actor } = gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }

  try {
    const data = await userDb(actor.profile.id, async (tx) => {
      const u = await tx.public_users.findUnique({
        where: { id: userId },
        select: { id: true, full_name: true, email: true },
      });
      if (!u) return null;
      // Зеркало читает owner-gated DEFINER (под сессией владельца).
      let password: string | null = null;
      let passwordUpdatedAt: string | null = null;
      try {
        const sec = await rpcGetUserLoginSecret(tx, { userId });
        password = sec?.password ?? null;
        passwordUpdatedAt = sec?.updated_at ?? null;
      } catch (err) {
        console.error('[getUserCredentials.secret]', err);
      }
      return {
        email: u.email,
        fullName: u.full_name,
        password,
        passwordUpdatedAt,
      };
    });
    if (!data) return { ok: false, error: t.users.errors.userNotFound };
    return { ok: true, data };
  } catch (err) {
    console.error('[getUserCredentials]', err);
    return { ok: false, error: t.users.errors.userNotFound };
  }
}

// ── Выдать новый (случайный) пароль ─────────────────────────────────────────
export async function reissueUserPasswordAction(
  userId: string,
): Promise<PasswordResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { actor } = gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }

  const password = generateTempPassword();
  try {
    await writePassword(userId, password);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return { ok: false, error: t.users.errors.userNotFound };
    }
    console.error('[reissueUserPassword]', err);
    return { ok: false, error: t.users.errors.updatePasswordFailed };
  }

  // Зеркало для показа владельцу (owner-gated DEFINER под сессией владельца).
  try {
    await userDb(actor.profile.id, (tx) =>
      rpcSetUserLoginSecret(tx, { userId, password }),
    );
  } catch (err) {
    console.error('[reissueUserPassword.mirror]', err);
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_password_reset',
    changes: {},
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  return { ok: true, password };
}

// ── Задать конкретный пароль (владелец вводит свой) ──────────────────────────
export async function setUserPasswordAction(
  userId: string,
  password: string,
): Promise<PasswordResult> {
  const gate = await ownerOrError((error) => ({ ok: false as const, error }));
  if ('ok' in gate) return gate;
  const { actor } = gate;
  const { t } = await getT();
  if (!UUID_RE.test(userId)) {
    return { ok: false, error: t.users.errors.userNotFound };
  }
  const pw = password ?? '';
  if (pw.length < 6) return { ok: false, error: t.users.errors.passwordTooShort };
  if (pw.length > 72) return { ok: false, error: t.users.errors.passwordTooLong };

  try {
    await writePassword(userId, pw);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return { ok: false, error: t.users.errors.userNotFound };
    }
    console.error('[setUserPassword]', err);
    return { ok: false, error: t.users.errors.updatePasswordFailed };
  }

  try {
    await userDb(actor.profile.id, (tx) =>
      rpcSetUserLoginSecret(tx, { userId, password: pw }),
    );
  } catch (err) {
    console.error('[setUserPassword.mirror]', err);
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_password_reset',
    changes: {},
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
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

  const db = adminDb();
  try {
    // Дружелюбная проверка занятости; гонку добивает unique-индекс
    // lower(email) (ловим 23505 ниже).
    const clash = await db.auth_users.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (clash) return { ok: false, error: t.users.errors.emailExists };

    // Email в auth (логин) и в профиле (отображение) — одной транзакцией.
    await db.$transaction([
      db.auth_users.update({
        where: { id: userId },
        data: { email, updated_at: new Date() },
      }),
      db.public_users.update({
        where: { id: userId },
        data: { email },
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: t.users.errors.emailExists };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return { ok: false, error: t.users.errors.userNotFound };
    }
    console.error('[changeUserEmail]', err);
    return { ok: false, error: t.users.errors.updateEmailFailed };
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_email_changed',
    changes: { email },
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  return { ok: true, email };
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

  let target: { email: string; role: Role; full_name: string } | null;
  let blockers: DeleteBlockers;
  try {
    const res = await userDb(actor.profile.id, async (tx) => {
      const u = await tx.public_users.findUnique({
        where: { id: userId },
        select: { email: true, role: true, full_name: true },
      });
      if (!u) return null;
      // Превентивная проверка истории (дружелюбное сообщение). Реальный страж — FK.
      const blk = await rpcUserDeleteBlockers(tx, { userId });
      return { u, blk };
    });
    if (!res) return { ok: false, error: t.users.errors.userNotFound };
    target = res.u;
    blockers = res.blk as unknown as DeleteBlockers;
  } catch (err) {
    console.error('[deleteUser.blockers]', err);
    return { ok: false, error: t.users.errors.deleteFailed };
  }

  if (!blockers?.can_delete) {
    return { ok: false, error: t.users.errors.deleteBlocked, blockers };
  }

  // Чистая учётка → удаляем auth-строку; public.users и зеркало пароля
  // снимаются каскадом (FK users_id_fkey ON DELETE CASCADE).
  try {
    await adminDb().auth_users.delete({ where: { id: userId } });
  } catch (err) {
    // Гонка: история появилась между проверкой и удалением → FK не дал. Безопасно.
    console.error('[deleteUser]', err);
    return { ok: false, error: t.users.errors.deleteFailed, blockers };
  }

  await logActivity({
    entity_type: 'user',
    entity_id: userId,
    action: 'user_deleted',
    changes: { email: target.email, role: target.role, full_name: target.full_name },
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  return { ok: true };
}
