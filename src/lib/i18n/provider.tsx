'use client';

import { createContext, useContext, useMemo } from 'react';

import type { Locale } from './config';
import { makeI18n, type I18n } from './core';
import type { Messages } from './messages';

// Контекст локализации для Client Components. Серверный app-layout кладёт сюда
// УЖЕ разрешённый язык и его словарь (чистые данные — сериализуются через RSC,
// в клиентский бандл попадает только активный язык, не оба).

const I18nContext = createContext<I18n | null>(null);

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => makeI18n(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within <LocaleProvider>');
  }
  return ctx;
}
