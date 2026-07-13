import { Sparkles } from 'lucide-react';

import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47 } from '@/lib/i18n/config';

// ============================================================================
// Hero-баннер дашборда (каркас владельца 2026-07-13): большой градиентный
// блок с приветствием по времени суток, датой-чипом, сводкой дня и парой
// мини-статов на «стекле». Декор — размытые орбы + тонкая сетка.
// Серверный компонент; появление — общий CSS fade-in-up.
// ============================================================================

export type HeroStat = {
  label: string;
  value: string;
  hint?: string;
};

function greetingKey(hour: number): 'morning' | 'day' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

export async function HeroBanner({
  name,
  taskCount,
  overdueCount,
  revenueUpPct,
  stats,
}: {
  /** Полное имя — покажем первое слово. */
  name: string;
  /** Открытые задачи пользователя на сегодня (Киев). */
  taskCount: number;
  /** Все просроченные открытые задачи в зоне видимости. */
  overdueCount: number;
  /** Положительная дельта выручки («+18%») — добавляет фразу-похвалу (staff). */
  revenueUpPct?: string;
  /** До двух мини-статов на стекле справа. */
  stats: HeroStat[];
}) {
  const { t, fmt, plural, locale } = await getT();
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  // Час и дата — в поясе фирмы (Киев), не сервера.
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Kyiv',
    }).format(now),
  );
  const dateLabelRaw = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Kyiv',
  }).format(now);
  const dateLabel = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1);

  const greeting = t.dashboard.hero[greetingKey(hour)];

  // Сводка: «У вас {tasks} и {overdue}.» — числовые части жирнее (как каркас).
  const tasksPart =
    taskCount > 0
      ? plural(t.dashboard.hero.tasksToday, taskCount)
      : t.dashboard.hero.noTasksToday;
  const overduePart =
    overdueCount > 0
      ? plural(t.dashboard.hero.overdueCount, overdueCount)
      : t.dashboard.hero.noOverdue;
  const summaryParts = t.dashboard.hero.summary.split(/(\{tasks\}|\{overdue\})/);

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-6 animate-fade-in-up sm:p-8"
      style={{ background: 'var(--grad-hero)' }}
    >
      {/* Декоративные размытые орбы */}
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ background: 'rgba(255,255,255,0.45)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-32 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: 'var(--primary-bright)' }}
        aria-hidden="true"
      />
      {/* Тонкая сетка-узор */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-semibold text-white backdrop-blur-sm">
            <Sparkles size={12} strokeWidth={2.5} aria-hidden="true" />
            {dateLabel}
          </span>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[32px]">
            {greeting}, {firstName} 👋
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">
            {summaryParts.map((part, i) => {
              if (part === '{tasks}')
                return (
                  <span key={i} className="font-semibold text-white">
                    {tasksPart}
                  </span>
                );
              if (part === '{overdue}')
                return (
                  <span key={i} className="font-semibold text-white">
                    {overduePart}
                  </span>
                );
              return <span key={i}>{part}</span>;
            })}
            {revenueUpPct && (
              <> {fmt(t.dashboard.hero.revenueUp, { pct: revenueUpPct })}</>
            )}
          </p>
        </div>

        {stats.length > 0 && (
          <div className="flex shrink-0 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="min-w-[128px] rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-md"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                  {s.label}
                </p>
                <p className="mt-1 font-mono text-[20px] font-bold leading-none tracking-tight text-white tabular-nums">
                  {s.value}
                </p>
                {s.hint && (
                  <p className="mt-1 text-[11px] text-white/75">{s.hint}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
