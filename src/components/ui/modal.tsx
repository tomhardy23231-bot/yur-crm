'use client';

import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Заголовок в шапке (привязывается к dialog через aria-labelledby). */
  title: string;
  /** Необязательная подпись под заголовком. */
  subtitle?: string;
  children: ReactNode;
  /** Подпись для кнопки-крестика и клика по подложке (a11y). */
  closeLabel: string;
  /** Ширина карточки. По умолчанию ~560px. */
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Лёгкая доступная модалка (portal + подложка + карточка). Esc и клик по
// подложке закрывают; фокус переводится внутрь и возвращается на триггер;
// Tab зациклен внутри; скролл body заблокирован, пока открыта. Стиль —
// по эталону онбординг-модалки (bg-surface, shadow-pop, wm-fade/wm-pop).
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  closeLabel,
  className,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  // Элемент, на который вернём фокус после закрытия (обычно — кнопка-триггер).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC уже обработан вложенным слоем (открытый Radix-select сам ловит
        // ESC и ставит defaultPrevented) — тогда модалку не закрываем.
        if (e.defaultPrevented) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        // Ловушка фокуса: Tab/Shift+Tab не выходят за пределы карточки.
        const nodes = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;

    // Блокируем скролл фона.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Фокус внутрь: первый интерактивный элемент или сама карточка.
    const focusFirst = () => {
      const node = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (node ?? cardRef.current)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, handleKey]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
    >
      {/* Подложка */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay backdrop-blur-[4px] animate-[wm-fade_220ms_ease-out]"
      />

      {/* Карточка */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex w-[min(560px,95vw)] max-h-[90vh] flex-col overflow-hidden',
          'rounded-modal border border-border bg-surface shadow-[var(--shadow-pop)]',
          'antialiased outline-none animate-[wm-pop_260ms_var(--ease-out)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-text"
            >
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="mt-1 text-[12.5px] text-text-muted">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1.5 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
