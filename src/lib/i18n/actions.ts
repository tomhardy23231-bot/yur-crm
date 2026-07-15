'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { LOCALE_COOKIE, coerceLocale, type Locale } from './config';
import { requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { rpcSetMyLanguage } from '@/lib/db/rpc';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ChangeLanguageState = { ok: boolean; error?: string };

// Смена языка интерфейса текущим пользователем. Пишем в БД через узкую
// SECURITY DEFINER функцию (set_my_language — только своя строка, только колонка
// language) и зеркалим в cookie (для <html lang> и экрана входа). revalidatePath
// обновляет серверные компоненты на новом языке без полной перезагрузки.
export async function changeLanguageAction(
  next: Locale,
): Promise<ChangeLanguageState> {
  const user = await requireUser();
  const lang = coerceLocale(next);

  try {
    await userDb(user.profile.id, (tx) => rpcSetMyLanguage(tx, { lang }));
  } catch (err) {
    console.error('changeLanguageAction.rpc:', err);
    return { ok: false, error: String(err) };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, lang, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
