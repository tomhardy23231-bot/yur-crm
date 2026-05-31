import Link from 'next/link';
import { ChevronLeft, FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Задача 9a: дружелюбный экран для дела, которого нет ИЛИ к которому нет доступа.
// Не раскрываем, существует ли дело (приватность): одинаковый текст для обоих
// случаев. Рендерится при вызове notFound() в cases/[id]/page.tsx (RLS вернула
// null → дело невидимо текущему пользователю).
export default function CaseNotFound() {
  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      <Link
        href="/cases"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />К списку дел
      </Link>

      <Card className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-3 p-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
          <FileQuestion size={24} strokeWidth={1.75} />
        </span>
        <h1 className="text-[18px] font-semibold text-text">Дело недоступно</h1>
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          Дело не найдено или у вас нет к нему доступа. Возможно, его ведёт
          другой сотрудник. Если считаете, что это ошибка — обратитесь к
          администратору.
        </p>
        <Button asChild className="mt-1">
          <Link href="/cases">Перейти к моим делам</Link>
        </Button>
      </Card>
    </main>
  );
}
