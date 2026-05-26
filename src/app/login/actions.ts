'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LoginFormState = {
  error?: string;
};

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
  const email = formData.get('email');
  const password = formData.get('password');
  const next = safeNext(formData.get('next'));

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Заполните email и пароль.' };
  }
  if (!email || !password) {
    return { error: 'Заполните email и пароль.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Не раскрываем, что именно не сошлось (email vs пароль) — стандартная
    // практика против user-enumeration.
    return { error: 'Не удалось войти. Проверьте email и пароль.' };
  }

  // Дополнительный страж: если в public.users пользователь помечен is_active=false,
  // ему нечего делать в системе. RLS уже отрежет доступ, но залогиниться
  // мы ему тоже не дадим.
  const { data: profile } = await supabase
    .from('users')
    .select('is_active')
    .eq('id', data.user.id)
    .maybeSingle<{ is_active: boolean }>();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'Учётная запись неактивна. Обратитесь к администратору.' };
  }

  redirect(next);
}
