import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { userDb } from '@/lib/db';
import {
  resolveCaps,
  type EffectiveCaps,
  type PermOverrides,
  type UserProfile,
} from '@/lib/types/db';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';

export type CurrentUser = {
  authId: string;
  email: string;
  profile: UserProfile;
  // Эффективные права (роль + персональные оверрайды). Для гейтинга UI/actions.
  // БД остаётся источником правды (RLS); это производная для удобства.
  caps: EffectiveCaps;
};

// Один источник правды о текущем пользователе (цикл v4 — свой auth).
//
// 1) Подпись JWT из httpOnly-куки проверяется ЛОКАЛЬНО (jose, без сети) —
//    личность = claims.sub. Сетевых обращений к Auth-серверу нет вовсе.
// 2) Затем ОДИН запрос БД: строка public.users под RLS пользователя
//    (политика users_select_all пускает только АКТИВНОГО сотрудника — сам
//    private.active_uid() возвращает NULL для is_active=false, так что
//    деактивированный не прочитает даже свою строку → null, fail-closed).
// 3) pwd_version из клейма сравнивается с колонкой: расхождение = токен
//    выпущен до смены/выдачи пароля → сессия отозвана (ревью V2 — механизм
//    инвалидации без таблицы сессий).
//
// `cache()` мемоизирует результат в пределах одного React-рендера, чтобы
// несколько SC на одной странице не дергали проверку заново.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  // Ошибка БД → null → /login (fail-closed, как и прежний путь при
  // profileError). Данных без профиля всё равно нет — RLS отрежет.
  let row;
  try {
    row = await userDb(claims.sub, (tx) =>
      tx.public_users.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
          perm_overrides: true,
          language: true,
          department_id: true,
          position: true,
          visibility_scope: true,
          pwd_version: true,
        },
      }),
    );
  } catch (err) {
    console.error('[current-user] profile query failed:', err);
    return null;
  }

  if (!row) return null; // RLS отрезал: деактивирован или удалён
  if (!row.is_active) return null; // двойная страховка поверх RLS
  if (row.pwd_version !== claims.pwd_version) return null; // сессии отозваны

  const overrides: PermOverrides =
    row.perm_overrides !== null &&
    typeof row.perm_overrides === 'object' &&
    !Array.isArray(row.perm_overrides)
      ? (row.perm_overrides as PermOverrides)
      : {};
  const language = isLocale(row.language) ? row.language : DEFAULT_LOCALE;

  const profile: UserProfile = {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    perm_overrides: overrides,
    language,
    department_id: row.department_id,
    position: row.position,
    visibility_scope:
      row.visibility_scope === 'all' ? 'all' : 'department',
  };

  return {
    authId: claims.sub,
    email: row.email,
    profile,
    caps: resolveCaps(row.role, overrides),
  };
});
