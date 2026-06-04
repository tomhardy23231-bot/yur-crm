import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config';
import { makeI18n, type I18n } from './core';
import { getMessages } from './messages';
import { getCurrentUser } from '@/lib/auth/current-user';

// Разрешение активного языка на сервере. Порядок:
//   1) cookie `locale` (ставится при логине и при смене языка) — быстрый путь,
//      работает и на /login без БД;
//   2) сохранённый язык пользователя (public.users.language) — на случай, если
//      cookie ещё не выставлена (легаси-сессия до фичи);
//   3) дефолт — украинский.
// cache() мемоизирует на один рендер: множество Server Components на странице
// не пересчитывают язык и не дёргают getCurrentUser повторно.
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const user = await getCurrentUser();
  if (user && isLocale(user.profile.language)) return user.profile.language;

  return DEFAULT_LOCALE;
});

// Переводчик для Server Components / Server Actions: `const { t, fmt, plural } = await getT()`.
export const getT = cache(async (): Promise<I18n> => {
  const locale = await getLocale();
  return makeI18n(locale, getMessages(locale));
});

export { getMessages };
