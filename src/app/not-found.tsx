import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';

// Корневой 404 (Сессия 5). Рендерится в корневом layout (без сайдбара) — для
// несуществующих маршрутов вне рабочей зоны. Локаль — через серверный getT.
export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <Card className="flex w-full max-w-md flex-col items-center gap-3 p-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
          <FileQuestion size={24} strokeWidth={1.75} />
        </span>
        <h1 className="text-[18px] font-semibold text-text">
          {t.errors.notFoundTitle}
        </h1>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          {t.errors.notFoundText}
        </p>
        <Button asChild className="mt-1">
          <Link href="/">{t.errors.boundaryHome}</Link>
        </Button>
      </Card>
    </main>
  );
}
