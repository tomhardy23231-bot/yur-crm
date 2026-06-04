// Ядро локализации, общее для сервера и клиента (без 'server-only' и без
// next/headers — чистые функции, чтобы импортировалось и в Client Components).

import { LOCALE_BCP47, type Locale } from './config';
import type { Messages } from './messages';

// Форматы множественного числа. uk/ru используют категории Intl.PluralRules:
//   one (1, 21, 31…), few (2–4, 22–24…), many (0, 5–20, 11–14…), other (дробные).
// Заполняем минимум one/few/many/other; two/zero не нужны для uk/ru.
export type PluralForms = {
  one: string;
  few: string;
  many: string;
  other?: string;
};

// Подстановка {param} в шаблон. Неизвестные плейсхолдеры оставляем как есть —
// это сразу видно при недопереводе и не роняет рендер.
export function fmt(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

// Возвращает функцию выбора правильной формы по числу для данной локали.
// Использует встроенный Intl.PluralRules — без сторонних зависимостей.
export function makePlural(locale: Locale) {
  const rules = new Intl.PluralRules(LOCALE_BCP47[locale]);
  return (forms: PluralForms, n: number): string => {
    const category = rules.select(n) as keyof PluralForms;
    const template = forms[category] ?? forms.other ?? forms.many;
    return fmt(template, { n });
  };
}

// Единый объект переводчика — одинаковый на сервере (getT) и на клиенте (useI18n).
export type I18n = {
  locale: Locale;
  /** Словарь активного языка: t.cases.list.title и т.п. */
  t: Messages;
  /** Подстановка параметров: fmt(t.errors.minLen, { n }). */
  fmt: typeof fmt;
  /** Множественное число: plural(t.cases.count, n). */
  plural: (forms: PluralForms, n: number) => string;
};

export function makeI18n(locale: Locale, messages: Messages): I18n {
  return {
    locale,
    t: messages,
    fmt,
    plural: makePlural(locale),
  };
}
