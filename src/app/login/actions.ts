'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { LOCALE_COOKIE, coerceLocale } from '@/lib/i18n/config';

export type LoginFormState = {
  error?: string;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Допустимые целевые пути после логина: только относительные, чтобы избежать
// open-redirect через `?next=https://evil.example`.
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== 'string' || next.length === 0) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Не раскрываем, что именно не сошлось (email vs пароль) — стандартная
    // практика против user-enumeration.
    return { error: t.auth.login.failed };
  }

  // Дополнительный страж: если в public.users пользователь помечен is_active=false,
  // ему нечего делать в системе. RLS уже отрежет доступ, но залогиниться
  // мы ему тоже не дадим. Заодно читаем сохранённый язык — кладём его в cookie,
  // чтобы интерфейс сразу открылся на языке пользователя.
  const { data: profile } = await supabase
    .from('users')
    .select('is_active, language')
    .eq('id', data.user.id)
    .maybeSingle<{ is_active: boolean; language: string | null }>();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: t.auth.login.inactive };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, coerceLocale(profile.language), {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  redirect(next);
}
