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
// 1) `supabase.auth.getClaims()` устанавливает личность пользователя. При
//    асимметричных JWT-ключах подпись проверяется ЛОКАЛЬНО по кэшированному
//    JWKS — без сетевого round-trip к Auth-серверу на каждый рендер (proxy
//    сессию уже валидировал/обновил). Безопасность сохранена: подпись
//    проверяется криптографически, в отличие от getSession (см. @supabase/ssr —
//    getClaims рекомендован для access-решений). При симметричном ключе (HS256)
//    getClaims внутри откатывается на getUser() — поведение как раньше.
// 2) Затем читаем строку из public.users — там лежит роль и is_active.
//    Чтение идёт под RLS пользователя; политика `users_select_all`
//    разрешает любому активному сотруднику видеть всех остальных, поэтому
//    свою строку он точно получит.
// 3) Если is_active = false → возвращаем null. RLS уже отрезает доступ к
//    данным, это финальный страж для UI.
//
// `cache()` мемоизирует результат в пределах одного React-рендера, чтобы
// несколько SC на одной странице не дергали проверку заново.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  // getClaims может бросить НЕ-AuthError (сбой fetch JWKS / WebCrypto / alg).
  // Любой сбой проверки трактуем как «нет пользователя» → requireUser отправит
  // на /login (fail-closed, как падал бы старый getUser-путь возвратом null).
  let claims: { sub?: string; email?: unknown } | null = null;
  try {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError) return null;
    claims = claimsData?.claims ?? null;
  } catch {
    return null;
  }
  if (!claims?.sub) return null;
  const authId = claims.sub;
  const authEmail = typeof claims.email === 'string' ? claims.email : undefined;

  const BASE_COLS = 'id, full_name, email, role, is_active, created_at';
  // Поля v2 (Этап 1/3): подразделение, должность, скоуп видимости.
  const EXT_COLS = 'perm_overrides, language, department_id, position, visibility_scope';
  let { data: profile, error: profileError } = await supabase
    .from('users')
    .select(`${BASE_COLS}, ${EXT_COLS}`)
    .eq('id', authId)
    .maybeSingle<UserProfile>();

  // Защита от рассинхрона деплоя/отката: если расширенных колонок
  // (perm_overrides/language/department_id/position/visibility_scope) ещё нет
  // (код выкатился раньше миграции) или уже нет (миграцию откатили) — НЕ
  // разлогиниваем всех (иначе тотальный локаут без возможности войти). Читаем
  // профиль без них и работаем по дефолтам (поведение до миграции, fail-safe).
  if (
    profileError &&
    (profileError.message.includes('perm_overrides') ||
      profileError.message.includes('language') ||
      profileError.message.includes('department_id') ||
      profileError.message.includes('position') ||
      profileError.message.includes('visibility_scope'))
  ) {
    const fallback = await supabase
      .from('users')
      .select(BASE_COLS)
      .eq('id', authId)
      .maybeSingle<
        Omit<
          UserProfile,
          | 'perm_overrides'
          | 'language'
          | 'department_id'
          | 'position'
          | 'visibility_scope'
        >
      >();
    if (!fallback.error && fallback.data) {
      profile = {
        ...fallback.data,
        perm_overrides: {},
        language: DEFAULT_LOCALE,
        department_id: null,
        position: null,
        visibility_scope: 'department',
      };
      profileError = null;
    }
  }

  if (profileError || !profile) return null;
  if (!profile.is_active) return null;

  const overrides = profile.perm_overrides ?? {};
  const language = isLocale(profile.language) ? profile.language : DEFAULT_LOCALE;
  return {
    authId,
    email: profile.email ?? authEmail,
    profile: { ...profile, perm_overrides: overrides, language },
    caps: resolveCaps(profile.role, overrides),
  };
});
