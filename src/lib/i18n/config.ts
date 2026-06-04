// Базовая конфигурация локализации (двуязычный UI: украинский + русский).
// По умолчанию для всех — украинский; каждый пользователь меняет язык у себя,
// и выбор сохраняется в public.users.language (+ cookie для html lang и логина).

export const LOCALES = ['uk', 'ru'] as const;

export type Locale = (typeof LOCALES)[number];

// Язык по умолчанию для всех новых/неаутентифицированных пользователей.
export const DEFAULT_LOCALE: Locale = 'uk';

// Имя cookie, в которой держим активный язык. Нужна, чтобы:
//   • root layout мог выставить <html lang> без обращения к БД;
//   • экран входа (до сессии) знал язык.
// Источник правды о сохранённом языке — public.users.language; cookie лишь
// зеркалит его (ставится при логине и при смене языка).
export const LOCALE_COOKIE = 'locale';

// Подпись языка на его же языке (для селектора) — не переводится.
export const LOCALE_LABEL: Record<Locale, string> = {
  uk: 'Українська',
  ru: 'Русский',
};

// BCP-47 код для атрибута <html lang> и Intl.* (даты, числа, множественное число).
export const LOCALE_BCP47: Record<Locale, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// Нормализуем произвольное значение к допустимой локали (или к дефолту).
export function coerceLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
