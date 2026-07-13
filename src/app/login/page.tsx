import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarDays, Wallet } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getLocale, getMessages, getT } from '@/lib/i18n/server';
import { LocaleProvider } from '@/lib/i18n/provider';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.auth.login.metaTitle };
}

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

  const locale = await getLocale();
  const messages = getMessages(locale);
  const { login, brand, brandTagline } = messages.auth;

  const features = [
    { icon: Briefcase, label: login.panelFeature1 },
    { icon: CalendarDays, label: login.panelFeature2 },
    { icon: Wallet, label: login.panelFeature3 },
  ];

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <div className="flex min-h-dvh flex-1">
        {/* Левая половина — форма входа. */}
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm flex flex-col gap-8">
            <header className="flex flex-col gap-3">
              {/* Бренд-строка — только когда правой панели нет (< lg). */}
              <span className="inline-flex items-center gap-2.5 self-start lg:hidden">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] font-bold leading-none"
                  style={{
                    background: 'var(--grad-brand)',
                    color: 'var(--brand-tile-fg)',
                    boxShadow: 'var(--shadow-brand-tile)',
                  }}
                  aria-hidden="true"
                >
                  Ю
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[17px] font-bold tracking-[-0.01em] text-text">
                    {brand}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                    {brandTagline}
                  </span>
                </span>
              </span>
              <h1 className="text-[36px] leading-[1.1] tracking-[-0.02em] font-bold text-text">
                {login.headingPrefix}{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'var(--grad-brand)' }}
                >
                  {login.headingAccent}
                </span>
              </h1>
              <p className="text-[14px] text-text-muted leading-[1.55]">
                {login.subtitle}
              </p>
            </header>

            <LoginForm next={next} />
          </div>
        </div>

        {/* Правая половина — брендовая ink-панель (та же тёмная гамма, что и
            сайдбар приложения). Только ≥ lg; на мобильных остаётся чистая форма. */}
        <aside
          className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex xl:w-2/5 xl:p-12"
          style={{
            backgroundColor: 'var(--sidebar-bg)',
            backgroundImage: 'var(--sidebar-bg-gradient)',
          }}
        >
          {/* Декор: мягкое синее свечение в верхнем углу. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full opacity-20"
            style={{
              background:
                'radial-gradient(closest-side, var(--primary), transparent)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-56 -left-40 h-[420px] w-[420px] rounded-full opacity-10"
            style={{
              background:
                'radial-gradient(closest-side, var(--primary-bright), transparent)',
            }}
          />

          {/* Шапка панели: крупная плитка бренда. */}
          <div className="relative flex items-center gap-3">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px] font-bold leading-none"
              style={{
                background: 'var(--grad-brand)',
                color: 'var(--brand-tile-fg)',
                boxShadow: 'var(--shadow-brand-tile)',
              }}
              aria-hidden="true"
            >
              Ю
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[19px] font-bold tracking-[-0.01em] text-white">
                {brand}
              </span>
              <span
                className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: 'var(--sidebar-text)' }}
              >
                {brandTagline}
              </span>
            </span>
          </div>

          {/* Слоган + ключевые возможности. */}
          <div className="relative flex max-w-md flex-col gap-8">
            <h2 className="text-[30px] font-bold leading-[1.18] tracking-[-0.02em] text-white xl:text-[34px]">
              {login.panelTitle}
            </h2>
            <ul className="flex flex-col gap-4">
              {features.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3.5">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{
                      background: 'var(--sidebar-hover-bg)',
                      border: '1px solid var(--sidebar-border)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon
                      size={17}
                      strokeWidth={1.75}
                      style={{ color: 'var(--sidebar-accent-bright)' }}
                    />
                  </span>
                  <span className="text-[14px] font-medium leading-snug text-white/90">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Нижний отступ — держит слоган по центру между шапкой и низом. */}
          <div aria-hidden="true" />
        </aside>
      </div>
    </LocaleProvider>
  );
}
