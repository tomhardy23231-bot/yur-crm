import Link from 'next/link';

import { cn } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

// ============================================================================
// Быстрые пресеты фильтров /cases (v3 Сессия 11) — чипы-ссылки в ряду поиска
// (после кнопки «Доска»). Пресет = готовый query из параметров, которые страница УЖЕ парсит;
// никакой новой логики в queries (кроме разрешённой сортировки stage_changed_at).
//   • «С долгом»  → ?debt=true
//   • «Зависшие»  → ?sort=stage_changed_at&dir=asc (дольше всех на этапе);
//   • «Закрытые за месяц» — УДАЛЁН 21.07 (по сути просто открывал архив);
//   • «Срочные» — пропущен: фильтра priority у листинга нет.
// Активный чип (его параметры ⊆ текущим searchParams) кликом сбрасывается на /cases.
// ============================================================================

type Preset = {
  key: string;
  label: string;
  params: Record<string, string>;
};

export async function CasesQuickFilters({
  sp,
  extra,
}: {
  /** Сырые searchParams страницы (для проверки активности пресета). */
  sp: Record<string, string | undefined>;
  /** Дополнительные чипы в той же ленте (сохранённые виды — клиентские). */
  extra?: React.ReactNode;
}) {
  const { t } = await getT();

  const presets: Preset[] = [
    {
      key: 'debt',
      label: t.cases.quickFilters.withDebt,
      params: { debt: 'true' },
    },
    {
      key: 'stale',
      label: t.cases.quickFilters.stale,
      params: { sort: 'stage_changed_at', dir: 'asc' },
    },
  ];

  const isActive = (preset: Preset): boolean =>
    Object.entries(preset.params).every(([key, value]) => sp[key] === value);

  const hrefFor = (preset: Preset): string => {
    if (isActive(preset)) return '/cases';
    const params = new URLSearchParams(preset.params);
    return `/cases?${params.toString()}`;
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={t.cases.quickFilters.aria}
    >
      {presets.map((preset) => {
        const active = isActive(preset);
        return (
          <Link
            key={preset.key}
            href={hrefFor(preset)}
            aria-pressed={active}
            className={cn(
              // Pill каркаса 2026-07-13: активный — тёмно-синяя заливка + белый
              // текст + синяя тень; неактивный синеет на hover.
              'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-chip border px-3 text-[12.5px] font-medium transition-all duration-[200ms]',
              active
                ? 'border-primary bg-primary-hover text-white shadow-brand'
                : 'border-border bg-surface text-text-muted hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed',
            )}
          >
            {preset.label}
          </Link>
        );
      })}
      {extra}
    </div>
  );
}
