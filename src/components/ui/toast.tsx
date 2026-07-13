'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';

// ============================================================================
// Лёгкая toast-система (v3 Сессия 11) — без зависимостей.
// useToast().success/error — мгновенная обратная связь на действие.
// flashToast() — «отложенный» тост для форм, чьи server actions делают
// redirect (client-form / case-form): сообщение переживает навигацию через
// sessionStorage и показывается провайдером на новой странице.
// ============================================================================

type ToastType = 'success' | 'error';

type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

// Стор-заглушка для useSyncExternalStore-детектора гидрации (см. ниже).
const emptySubscribe = () => () => {};

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const FLASH_KEY = 'yk-flash-toast';
// Flash старше TTL не показываем (защита от «застрявшего» сообщения,
// если redirect не случился из-за сбоя).
const FLASH_TTL_MS = 15_000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/**
 * Отложенный тост через навигацию (для форм с redirect в server action).
 * Ставится перед сабмитом; если action вернул ошибку (redirect не случился) —
 * вызывающий обязан снять его clearFlashToast().
 */
export function flashToast(type: ToastType, message: string): void {
  try {
    sessionStorage.setItem(
      FLASH_KEY,
      JSON.stringify({ type, message, ts: Date.now() }),
    );
  } catch {
    // sessionStorage недоступен (private mode) — просто без тоста.
  }
}

export function clearFlashToast(): void {
  try {
    sessionStorage.removeItem(FLASH_KEY);
  } catch {
    // ignore
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const pathname = usePathname();

  const push = useCallback((type: ToastType, message: string) => {
    idRef.current += 1;
    const item: ToastItem = { id: idRef.current, type, message };
    // Максимум MAX_TOASTS одновременно — старые вытесняются.
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), item]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push],
  );

  // Flash-сообщение из sessionStorage — читаем на mount и при каждой смене
  // маршрута (после redirect формы pathname меняется, провайдер живёт в layout).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FLASH_KEY);
      const flash = JSON.parse(raw) as {
        type?: string;
        message?: string;
        ts?: number;
      };
      if (
        typeof flash.message === 'string' &&
        typeof flash.ts === 'number' &&
        Date.now() - flash.ts < FLASH_TTL_MS
      ) {
        push(flash.type === 'error' ? 'error' : 'success', flash.message);
      }
    } catch {
      // битый JSON / sessionStorage недоступен — молча пропускаем
    }
  }, [pathname, push]);

  // Портал появляется только ПОСЛЕ гидрации: `typeof document` в рендере
  // давал разный вывод сервер/клиент → hydration mismatch на каждой странице.
  // useSyncExternalStore: SSR-снапшот false, клиентский true — React сам
  // дорендерит портал вторым проходом без рассинхрона.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          // pointer-events-none — контейнер не перехватывает клики по странице;
          // сами карточки кликабельны (pointer-events-auto).
          // Mobile: снизу по центру, выше bottom-nav; desktop (md+): правый низ.
          // z-[110] — выше модалок (z-[100]): тост виден и поверх диалога.
          <div
            aria-live="polite"
            className={cn(
              'pointer-events-none fixed inset-x-0 z-[110] flex flex-col items-center gap-2 px-4',
              'bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)]',
              'md:inset-x-auto md:bottom-4 md:right-4 md:items-end md:px-0',
            )}
          >
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  /** Стабильный dismiss провайдера (useCallback) — эффект таймера не дёргается. */
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();
  // Auto-dismiss с паузой при hover: на mouseenter останавливаем таймер,
  // на mouseleave досчитываем остаток.
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(close, remainingRef.current);
  }, [stopTimer, close]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current === null) return;
    remainingRef.current = Math.max(
      500,
      remainingRef.current - (Date.now() - startedAtRef.current),
    );
    stopTimer();
  }, [stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const isError = toast.type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      className={cn(
        'pointer-events-auto flex w-full max-w-[360px] items-start gap-2.5',
        'rounded-card border border-border bg-surface px-3.5 py-2.5',
        'shadow-[var(--shadow-lg)] animate-toast-in',
      )}
    >
      {isError ? (
        <AlertCircle
          size={16}
          strokeWidth={2}
          className="mt-px shrink-0 text-error"
          aria-hidden="true"
        />
      ) : (
        <CheckCircle2
          size={16}
          strokeWidth={2}
          className="mt-px shrink-0 text-success"
          aria-hidden="true"
        />
      )}
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-text">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={close}
        aria-label={t.common.close}
        className="-mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
