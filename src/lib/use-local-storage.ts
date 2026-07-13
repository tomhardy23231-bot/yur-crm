'use client';

import { useCallback, useSyncExternalStore } from 'react';

// ============================================================================
// Значение localStorage как внешний стор (React-рекомендованный путь чтения
// браузерного хранилища без setState-в-эффекте): SSR-снапшот — null, после
// гидрации React сам перечитает клиентское значение и дорендерит. Запись
// оповещает подписчиков той же вкладки кастомным событием — нативный
// storage-event браузер шлёт только ДРУГИМ вкладкам.
// ============================================================================

const EVENT = 'yurcase:local-storage';

export function writeLocalStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // приватный режим/квота — значение не переживёт перезагрузку
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function useLocalStorageValue(key: string): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onCustom = (e: Event) => {
        if ((e as CustomEvent<string>).detail === key) onChange();
      };
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onChange();
      };
      window.addEventListener(EVENT, onCustom);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(EVENT, onCustom);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
