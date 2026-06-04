'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { LOCALE_COOKIE, coerceLocale, type Locale } from './config';
import { requireUser } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ChangeLanguageState = { ok: boolean; error?: string };

// Смена языка интерфейса текущим пользователем. Пишем в БД через узкую
// SECURITY DEFINER функцию (set_my_language — только своя строка, только колонка
// language) и зеркалим в cookie (для <html lang> и экрана входа). revalidatePath
// обновляет серверные компоненты на новом языке без полной перезагрузки.
export async function changeLanguageAction(
  next: Locale,
): Promise<ChangeLanguageState> {
  await requireUser();
  const lang = coerceLocale(next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_my_language', { lang });
  if (error) {
    console.error('changeLanguageAction.rpc:', error.message);
    return { ok: false, error: error.message };
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
