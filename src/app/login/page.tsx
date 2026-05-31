import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Вход — ЮрКейс',
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
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2.5 self-start">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] font-bold leading-none"
              style={{
                background: 'var(--grad-brass)',
                color: 'var(--brand-tile-fg)',
                boxShadow: 'var(--shadow-brand-tile)',
              }}
              aria-hidden="true"
            >
              Ю
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[17px] font-bold tracking-[-0.01em] text-text">
                ЮрКейс
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                Legal CRM
              </span>
            </span>
          </span>
          <h1 className="text-[36px] leading-[1.1] tracking-[-0.02em] font-bold text-text">
            Вход в{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'var(--grad-brass)' }}
            >
              систему
            </span>
          </h1>
          <p className="text-[14px] text-text-muted leading-[1.55]">
            Внутренний инструмент. Доступ только для сотрудников компании.
          </p>
        </header>

        <LoginForm next={next} />
      </div>
    </div>
  );
}
