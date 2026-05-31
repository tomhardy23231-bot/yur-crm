'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, FilePlus2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Задача 4: закреплённая (sticky) панель карточки дела — быстрые ссылки-якоря на
// секции + ключевые действия. Остаётся видимой при прокрутке длинной карточки,
// чтобы действия не «закапывались» внизу. Подсветка активной секции — scrollspy.

const SECTIONS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'documents', label: 'Документы' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'finance', label: 'Финансы' },
  { id: 'history', label: 'История' },
] as const;

export function CaseActionBar({
  caseId,
  canEdit,
}: {
  caseId: string;
  canEdit: boolean;
}) {
  const [active, setActive] = useState<string>('overview');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActive(visible.target.id);
      },
      // Активной считаем секцию в верхней трети вьюпорта.
      { rootMargin: '-15% 0px -75% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-surface/85 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                active === s.id
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-muted hover:bg-surface-muted hover:text-text',
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href="#finance">
                <CreditCard size={14} strokeWidth={1.75} />
                Платёж
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#documents">
                <FilePlus2 size={14} strokeWidth={1.75} />
                Документ
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/cases/${caseId}/edit`}>
                <Pencil size={14} strokeWidth={1.75} />
                Редактировать
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
