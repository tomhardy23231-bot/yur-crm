'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LOCALE_COOKIE } from '@/lib/i18n/config';
import { errors as ruErrors } from '@/lib/i18n/messages/ru/errors';
import { errors as ukErrors } from '@/lib/i18n/messages/uk/errors';

// Локаль — из cookie напрямую (провайдер i18n мог не успеть смонтироваться к
// моменту сбоя). Имя cookie — единый источник из config. Fallback — украинский.
function readLocale(): 'uk' | 'ru' {
  if (typeof document === 'undefined') return 'uk';
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`),
  );
  return match && decodeURIComponent(match[1]!) === 'ru' ? 'ru' : 'uk';
}

// Error-граница рабочей зоны (Сессия 5): ловит сбои страниц внутри (app) и
// показывает дружелюбный экран вместо системного. Сайдбар/топбар остаются (этот
// boundary живёт ВНУТРИ layout группы), пользователь не теряет навигацию.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const t = readLocale() === 'ru' ? ruErrors : ukErrors;

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      <Card className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-3 p-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error">
          <TriangleAlert size={24} strokeWidth={1.75} />
        </span>
        <h1 className="text-[18px] font-semibold text-text">
          {t.boundaryTitle}
        </h1>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          {t.boundaryText}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Button type="button" onClick={() => reset()}>
            {t.boundaryRetry}
          </Button>
          {/* Жёсткая перезагрузка (не <Link>): полный reload сбрасывает
              повреждённое клиентское состояние, из-за которого сработала граница. */}
          <Button asChild variant="secondary">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">{t.boundaryHome}</a>
          </Button>
        </div>
      </Card>
    </main>
  );
}
