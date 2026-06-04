'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

import { LOCALES, LOCALE_LABEL, type Locale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { changeLanguageAction } from '@/lib/i18n/actions';
import { cn } from '@/lib/utils';

// Переключатель языка интерфейса. Пишет выбор в профиль (server action) и
// зеркалит в cookie; затем router.refresh() перерисовывает дерево на новом языке.
export function LanguageSwitcher() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Locale | null>(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  function choose(next: Locale) {
    if (next === locale || pending) return;
    setError(false);
    setSaved(false);
    setTarget(next);
    startTransition(async () => {
      const res = await changeLanguageAction(next);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(true);
      }
      setTarget(null);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="radiogroup"
        aria-label={t.account.language.label}
        className="inline-flex w-fit rounded-lg border border-border bg-surface-sunken p-1"
      >
        {LOCALES.map((loc) => {
          const active = loc === locale;
          const isTarget = target === loc;
          return (
            <button
              key={loc}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(loc)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13.5px] font-medium transition-colors',
                active
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text',
                pending && 'cursor-not-allowed opacity-80',
              )}
            >
              {isTarget && pending ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              ) : active ? (
                <Check size={14} strokeWidth={2.25} className="text-primary" />
              ) : null}
              {LOCALE_LABEL[loc]}
            </button>
          );
        })}
      </div>

      {saved && !error && (
        <p role="status" className="text-[12.5px] text-success">
          {t.account.language.saved}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-error">
          {t.account.language.error}
        </p>
      )}
    </div>
  );
}
