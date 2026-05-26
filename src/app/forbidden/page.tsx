import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Нет доступа — Юр CRM',
};

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Нет доступа
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Эта страница недоступна для вашей роли. Если вы считаете, что должны
          иметь доступ — обратитесь к владельцу аккаунта.
        </p>
        <Link
          href="/"
          className="mx-auto inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
