import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveCaps, type UserProfile, type EffectiveCaps } from '@/lib/types/db';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';

export type CurrentUser = {
  authId: string;
  email: string;
  profile: UserProfile;
  // Эффективные права (роль + персональные оверрайды). Для гейтинга UI/actions.
  // БД остаётся источником правды (RLS); это производная для удобства.
  caps: EffectiveCaps;
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

  const BASE_COLS = 'id, full_name, email, role, is_active, created_at';
  let { data: profile, error: profileError } = await supabase
    .from('users')
    .select(`${BASE_COLS}, perm_overrides, language`)
    .eq('id', authData.user.id)
    .maybeSingle<UserProfile>();

  // Защита от рассинхрона деплоя/отката: если колонок perm_overrides/language
  // ещё нет (код выкатился раньше миграции) или уже нет (миграцию откатили) — НЕ
  // разлогиниваем всех (иначе тотальный локаут без возможности войти). Читаем
  // профиль без них и работаем по дефолтам (поведение до миграции, fail-safe).
  if (
    profileError &&
    (profileError.message.includes('perm_overrides') ||
      profileError.message.includes('language'))
  ) {
    const fallback = await supabase
      .from('users')
      .select(BASE_COLS)
      .eq('id', authData.user.id)
      .maybeSingle<Omit<UserProfile, 'perm_overrides' | 'language'>>();
    if (!fallback.error && fallback.data) {
      profile = { ...fallback.data, perm_overrides: {}, language: DEFAULT_LOCALE };
      profileError = null;
    }
  }

  if (profileError || !profile) return null;
  if (!profile.is_active) return null;

  const overrides = profile.perm_overrides ?? {};
  const language = isLocale(profile.language) ? profile.language : DEFAULT_LOCALE;
  return {
    authId: authData.user.id,
    email: authData.user.email ?? profile.email,
    profile: { ...profile, perm_overrides: overrides, language },
    caps: resolveCaps(profile.role, overrides),
  };
});
