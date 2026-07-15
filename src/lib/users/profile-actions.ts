'use server';

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

import { requireUser } from '@/lib/auth/require-role';
import { adminDb } from '@/lib/db/admin';
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { getT } from '@/lib/i18n/server';

// Смена собственного пароля (цикл v4 — свой auth).
// Поток:
//   1) валидируем новый пароль и совпадение с повтором;
//   2) сверяем ТЕКУЩИЙ пароль с bcrypt-хешем auth.users — нельзя сменить
//      пароль, не зная старого;
//   3) пишем новый хеш + инкрементим public.users.pwd_version одной
//      транзакцией: ВСЕ сессии пользователя отзываются мгновенно
//      (клейм pwd_version в чужих токенах устарел — ревью V2);
//   4) текущему устройству выпускаем свежий токен с новой версией —
//      пользователь остаётся залогиненным.
// auth.users доступна только admin-пулу — файл в ESLint-allowlist осознанно.

export type ChangePasswordFields = 'current' | 'next' | 'confirm';

export type ChangePasswordState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<ChangePasswordFields, string>>;
};

const MIN_LEN = 8;
const MAX_LEN = 72; // предел bcrypt.

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();
  const { t, fmt } = await getT();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const fieldErrors: ChangePasswordState['fieldErrors'] = {};
  if (!current) fieldErrors.current = t.account.password.enterCurrent;
  if (!next) fieldErrors.next = t.account.password.enterNext;
  else if (next.length < MIN_LEN)
    fieldErrors.next = fmt(t.account.password.minLen, { n: MIN_LEN });
  else if (next.length > MAX_LEN)
    fieldErrors.next = fmt(t.account.password.tooLong, { n: MAX_LEN });
  if (next && confirm !== next) fieldErrors.confirm = t.account.password.mismatch;
  if (current && next && current === next) {
    fieldErrors.next = t.account.password.sameAsCurrent;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  let freshToken: string;
  try {
    const db = adminDb();

    // 1) Проверяем текущий пароль по хешу (без сети, в отличие от GoTrue).
    const account = await db.auth_users.findUnique({
      where: { id: user.authId },
    });
    if (!account) {
      console.error('changePasswordAction: auth account not found', user.authId);
      return { ok: false, message: t.errors.serviceUnavailable };
    }
    const currentOk =
      account.encrypted_password.length > 0 &&
      (await bcrypt.compare(current, account.encrypted_password));
    if (!currentOk) {
      return {
        ok: false,
        fieldErrors: { current: t.account.password.wrongCurrent },
      };
    }

    // 2) Новый хеш + отзыв всех сессий — атомарно.
    const hash = await bcrypt.hash(next, 10);
    const [, profile] = await db.$transaction([
      db.auth_users.update({
        where: { id: user.authId },
        data: {
          encrypted_password: hash,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date(),
        },
      }),
      db.public_users.update({
        where: { id: user.authId },
        data: { pwd_version: { increment: 1 } },
        select: { pwd_version: true },
      }),
    ]);

    // 3) Свежий токен для ЭТОГО устройства (lat обновляется: смена пароля —
    // событие уровня «новый вход»).
    freshToken = await issueSessionToken({
      sub: user.authId,
      email: user.email,
      pwdVersion: profile.pwd_version,
    });
  } catch (err) {
    console.error('changePasswordAction:', err);
    return { ok: false, message: t.account.password.updateFailed };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, freshToken, sessionCookieOptions());

  return { ok: true, message: t.account.password.successDefault };
}
