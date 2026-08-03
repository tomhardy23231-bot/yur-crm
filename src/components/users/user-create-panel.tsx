'use client';

import { useState } from 'react';
import { ChevronDown, UserPlus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';

// Свёрнутая панель создания сотрудника (2026-08-03, замечание владельца:
// форма занимала весь первый экран /settings/users, хотя людей заводят редко).
// Тот же приём, что у панели счетов в кассе: кнопка в строке заголовка,
// форма раскрывается под ней.
//
// Форма приходит children'ом — она серверная и остаётся такой; клиентское
// здесь только состояние «раскрыто/свёрнуто».
export function UserCreatePanel({
  intro,
  children,
}: {
  intro: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text">{t.users.heading}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border px-3 text-[12.5px] font-medium transition-all duration-[200ms]',
            open
              ? 'border-primary-border bg-primary-softer text-primary-pressed'
              : 'border-border bg-surface text-text-muted hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed',
          )}
        >
          <UserPlus size={13} strokeWidth={1.75} aria-hidden="true" />
          {t.users.create.submit}
          <ChevronDown
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className={cn('transition-transform duration-[200ms]', open && 'rotate-180')}
          />
        </button>
      </div>

      {open && (
        <Card>
          <div className="p-5">
            <p className="mb-4 text-[13px] text-text-muted">{intro}</p>
            {children}
          </div>
        </Card>
      )}
    </section>
  );
}
