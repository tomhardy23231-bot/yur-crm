'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';

import { adminDb } from '@/lib/db/admin';
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { getT } from '@/lib/i18n/server';
import { LOCALE_COOKIE, coerceLocale } from '@/lib/i18n/config';

// Вход (цикл v4 — свой auth вместо GoTrue). Логин — единственный
// пользовательский путь, которому нужен admin-пул: пользователь ещё НЕ
// аутентифицирован, а auth.users доступна только owner-роли БД (файл в
// ESLint-allowlist adminDb осознанно).

export type LoginFormState = {
  error?: string;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Rate-limit подбора пароля (план v4, ревью V3-4): GoTrue давал его из
// коробки — свой вход обязан сам. После MAX_FREE_ATTEMPTS неудач подряд
// аккаунт блокируется на экспоненциально растущее время (счётчик и
// locked_until живут в auth.users). Временные пароли короткие (6 символов),
// перебор без лимита реалистичен.
const MAX_FREE_ATTEMPTS = 5;
const LOCK_CAP_MS = 15 * 60 * 1000;

function lockDurationMs(failedAttempts: number): number {
  const over = Math.max(0, failedAttempts - MAX_FREE_ATTEMPTS); // 0,1,2…
  return Math.min(60_000 * 2 ** over, LOCK_CAP_MS); // 1м → 2м → 4м → 8м → 15м
}

// bcrypt-хеш случайной строки: для несуществующего email всё равно жжём
// сравнение, чтобы время ответа не выдавало, существует ли учётка
// (anti user-enumeration по таймингу).
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// Допустимые целевые пути после логина: только относительные, чтобы избежать
// open-redirect через `?next=https://evil.example`.
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== 'string' || next.length === 0) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

// Журнал 2026-07-21: входы в систему (успех/неудача) — в ленту владельца
// (entity 'auth', в SELECT-политике только owner). Пишем ПРЯМОЙ вставкой через
// admin-пул: логин — санкционированный adminDb-путь (пользователь ещё не
// аутентифицирован), а RLS-путь log_activity требует активную учётку
// (active_uid) и потерял бы попытку входа в деактивированную. Лог никогда
// не ломает сам вход.
async function logAuthEvent(
  userId: string,
  action: 'user_login' | 'user_login_failed',
  changes: Record<string, unknown>,
): Promise<void> {
  try {
    const h = await headers();
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null;
    const ua = (h.get('user-agent') ?? '').slice(0, 160) || null;
    await adminDb().activity_log.create({
      data: {
        entity_type: 'auth',
        entity_id: userId,
        user_id: userId,
        action,
        changes: { ...changes, ip, ua },
      },
    });
  } catch (err) {
    console.error('[loginAction] auth log failed:', err);
  }
}

export async function loginAction(
  _prevState: LoginFormState | undefined,
  formData: FormData,
): Promise<LoginFormState> {
  const { t } = await getT();
  const email = formData.get('email');
  const password = formData.get('password');
  const next = safeNext(formData.get('next'));

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: t.auth.login.fillBoth };
  }
  if (!email || !password) {
    return { error: t.auth.login.fillBoth };
  }

  let sessionToken: string;
  let language: string | null;
  try {
    const db = adminDb();
    const account = await db.auth_users.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });

    if (!account) {
      await bcrypt.compare(password, DUMMY_HASH);
      // Не раскрываем, что именно не сошлось (email vs пароль) — стандартная
      // практика против user-enumeration.
      return { error: t.auth.login.failed };
    }

    if (account.locked_until && account.locked_until.getTime() > Date.now()) {
      return { error: t.auth.login.locked };
    }

    const passwordOk =
      account.encrypted_password.length > 0 &&
      (await bcrypt.compare(password, account.encrypted_password));

    if (!passwordOk) {
      const failed = account.failed_attempts + 1;
      await db.auth_users.update({
        where: { id: account.id },
        data: {
          failed_attempts: failed,
          locked_until:
            failed >= MAX_FREE_ATTEMPTS
              ? new Date(Date.now() + lockDurationMs(failed))
              : null,
          updated_at: new Date(),
        },
      });
      await logAuthEvent(account.id, 'user_login_failed', {
        email: account.email,
        reason: 'wrong_password',
        attempt: failed,
      });
      return { error: t.auth.login.failed };
    }

    // Страж is_active + язык + версия пароля — одной строкой профиля.
    const profile = await db.public_users.findUnique({
      where: { id: account.id },
      select: { is_active: true, language: true, pwd_version: true },
    });
    if (!profile || !profile.is_active) {
      // Верный пароль у деактивированной учётки — заметное событие для владельца.
      await logAuthEvent(account.id, 'user_login_failed', {
        email: account.email,
        reason: 'inactive',
      });
      return { error: t.auth.login.inactive };
    }

    // Успех: сбрасываем счётчик неудач, если он был ненулевой.
    if (account.failed_attempts > 0 || account.locked_until) {
      await db.auth_users.update({
        where: { id: account.id },
        data: { failed_attempts: 0, locked_until: null },
      });
    }

    sessionToken = await issueSessionToken({
      sub: account.id,
      email: account.email,
      pwdVersion: profile.pwd_version,
    });
    language = profile.language;

    await logAuthEvent(account.id, 'user_login', { email: account.email });
  } catch (err) {
    console.error('[loginAction]', err);
    return { error: t.auth.login.failed };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  // Язык пользователя — в cookie, чтобы интерфейс сразу открылся на нём.
  store.set(LOCALE_COOKIE, coerceLocale(language), {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  redirect(next);
}
