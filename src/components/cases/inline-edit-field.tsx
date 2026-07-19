'use client';

import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

// Inline-правка одного поля прямо в «Деталях справи» (запрос владельца
// 2026-07-19): рядом со значением едва заметный карандаш (проявляется при
// наведении на строку), клик — компактный инпут/селект на месте значения,
// Enter/✓ сохраняет, Esc/✕ отменяет. Сохранение — server action, привязанный
// к полю на сервере (bind в case-info-grid); журналирование — внутри экшена.

type Option = { value: string; label: string };

interface InlineEditFieldProps {
  /** Подпись поля — для aria («Редагувати: Телефон»). */
  label: string;
  /** Текущее значение ('' = пусто). */
  value: string;
  /** Server action поля: (value) → { ok, message? }. */
  action: (value: string) => Promise<{ ok: boolean; message?: string }>;
  /** Есть опции → селект, нет → текстовый инпут. */
  options?: Option[];
  /** Пустое значение недопустимо (например, «№ / назва»). */
  required?: boolean;
  maxLength?: number;
  inputType?: 'text' | 'tel' | 'email';
  /** Отображение значения в режиме просмотра. */
  children: React.ReactNode;
}

export function InlineEditField({
  label,
  value,
  action,
  options,
  required = false,
  maxLength,
  inputType = 'text',
  children,
}: InlineEditFieldProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const open = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  // Клик в пустое место — выход из редактирования БЕЗ сохранения (просьба
  // владельца: случайный клик не должен записывать изменения — черновик
  // отбрасывается). Клики в Radix-порталы (открытое меню селекта) — не «вне».
  useEffect(() => {
    if (!editing) return;
    const onPointer = (e: PointerEvent) => {
      if (pending) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (formRef.current?.contains(target)) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      setEditing(false);
      setError(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [editing, pending]);

  const save = () => {
    if (pending) return;
    const next = draft.trim();
    if (required && !next) return;
    if (next === value.trim()) {
      cancel();
      return;
    }
    startTransition(async () => {
      const res = await action(next);
      if (res.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(res.message ?? t.errors.db.generic);
      }
    });
  };

  if (!editing) {
    return (
      <span className="group/ie inline-flex min-w-0 max-w-full items-center gap-2.5">
        <span className="min-w-0">{children}</span>
        <button
          type="button"
          onClick={open}
          aria-label={`${t.caseCard.actionBar.edit}: ${label}`}
          title={`${t.caseCard.actionBar.edit}: ${label}`}
          className={cn(
            'shrink-0 rounded-chip p-0.5 text-text-muted',
            // Едва заметен в покое, проявляется при наведении на строку/кнопку.
            'opacity-30 transition-[opacity,color] duration-150',
            'group-hover/ie:opacity-100 hover:text-primary',
            'focus-visible:opacity-100 focus-visible:outline-2',
            'focus-visible:outline-offset-1 focus-visible:outline-primary',
          )}
        >
          <Pencil size={12} strokeWidth={1.75} />
        </button>
      </span>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex w-full min-w-0 flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <span className="flex w-full min-w-0 items-center gap-1">
        {options ? (
          <Select
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            aria-label={label}
            className="h-7 w-full min-w-0 pl-2 pr-1.5 text-[12.5px] md:text-[12.5px]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            autoFocus
            type={inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            required={required}
            maxLength={maxLength}
            aria-label={label}
            className="h-7 px-2 py-1 text-[12.5px] md:text-[12.5px]"
          />
        )}
        <button
          type="submit"
          disabled={pending || (required && !draft.trim())}
          aria-label={t.common.save}
          title={t.common.save}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center',
            'rounded-control bg-primary text-white transition-opacity',
            'hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
            pending && 'cursor-wait opacity-70',
          )}
        >
          <Check size={13} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          aria-label={t.common.cancel}
          title={t.common.cancel}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center',
            'rounded-control border border-border bg-surface text-text-muted',
            'transition-colors hover:border-border-strong hover:text-text',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
          )}
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      </span>
      {error && <span className="text-[11px] text-error-text">{error}</span>}
    </form>
  );
}
