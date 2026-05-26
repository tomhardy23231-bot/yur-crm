import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Вход — Юр CRM',
};

type SearchParams = Promise<{ next?: string | string[] }>;

function pickNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = pickNext(sp.next);

  // Если пользователь уже залогинен и активен — пускаем дальше.
  // Проверка делается здесь (а не в proxy.ts), потому что только getCurrentUser
  // фильтрует по is_active. Иначе деактивированный пользователь с валидным
  // JWT попал бы в цикл редиректов / ↔ /login.
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Вход в Юр CRM
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Внутренний инструмент. Доступ только для сотрудников компании.
          </p>
        </header>

        <LoginForm next={next} />
      </div>
    </div>
  );
}
