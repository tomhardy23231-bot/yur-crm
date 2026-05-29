import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types/db';

export type CurrentUser = {
  authId: string;
  email: string;
  profile: UserProfile;
};

// Один источник правды о текущем пользователе.
//
// 1) `supabase.auth.getUser()` валидирует JWT с Auth-сервером (а не доверяет
//    cookie, как getSession). Используем для решений о доступе.
// 2) Затем читаем строку из public.users — там лежит роль и is_active.
//    Чтение идёт под RLS пользователя; политика `users_select_all`
//    разрешает любому активному сотруднику видеть всех остальных, поэтому
//    свою строку он точно получит.
// 3) Если is_active = false → возвращаем null. RLS уже отрезает доступ к
//    данным, это финальный страж для UI.
//
// `cache()` мемоизирует результат в пределах одного React-рендера, чтобы
// несколько SC на одной странице не дергали Auth-сервер заново.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, full_name, email, role, is_active, created_at')
    .eq('id', authData.user.id)
    .maybeSingle<UserProfile>();

  if (profileError || !profile) return null;
  if (!profile.is_active) return null;

  return {
    authId: authData.user.id,
    email: authData.user.email ?? profile.email,
    profile,
  };
});
