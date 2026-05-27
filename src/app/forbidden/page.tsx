import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Нет доступа — Юр CRM',
};

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col gap-5 text-center">
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-bold text-text">
          Нет доступа
        </h1>
        <p className="text-[14px] text-text-muted leading-[1.55]">
          Эта страница недоступна для вашей роли. Если вы считаете, что должны
          иметь доступ — обратитесь к владельцу аккаунта.
        </p>
        <Button asChild variant="secondary" className="mx-auto mt-2">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
