import Link from 'next/link';
import { Clock } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { TimeEntryRow } from '@/components/time-entries/time-entry-row';
import { requireUser } from '@/lib/auth/require-role';
import {
  listMyTimeEntries,
  TIME_PAGE_SIZE,
} from '@/lib/time-entries/queries';
import { formatMinutes } from '@/lib/time-entries/parse';
import type { TimeEntryWithRefs } from '@/lib/types/db';

type Period = 'week' | 'month' | 'all';
type Billable = 'all' | 'yes' | 'no';

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'all', label: 'Всё время' },
];

const BILLABLES: ReadonlyArray<{ value: Billable; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'yes', label: 'Оплачиваемые' },
  { value: 'no', label: 'Не оплачиваемые' },
];

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
});

const MONEY_FMT = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export default async function MyTimePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    billable?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const period: Period =
    sp.period === 'month' || sp.period === 'all' ? sp.period : 'week';
  const billable: Billable =
    sp.billable === 'yes' || sp.billable === 'no' ? sp.billable : 'all';
  const page = sp.page ? Math.max(1, Number(sp.page) || 1) : 1;

  const { dateFrom, dateTo } = computeRange(period);
  const billableParam =
    billable === 'all' ? undefined : billable === 'yes';

  const result = await listMyTimeEntries({
    userId: user.profile.id,
    dateFrom,
    dateTo,
    billable: billableParam,
    page,
  });

  // Summary считаем по ТЕКУЩЕЙ странице — total минут за весь фильтр
  // потребовал бы отдельного aggregate-запроса; в Phase 2/A показываем
  // итог страницы + «(всего записей: N)».
  const pageTotalMin = result.items.reduce((s, e) => s + e.minutes, 0);
  const pageBillableMin = result.items.reduce(
    (s, e) => s + (e.billable ? e.minutes : 0),
    0,
  );
  const pageAmount = result.items.reduce(
    (s, e) =>
      e.billable && e.hourly_rate != null
        ? s + (e.minutes / 60) * e.hourly_rate
        : s,
    0,
  );

  const groups = groupByDay(result.items);

  function buildHref(
    overrides: Partial<{ period: Period; billable: Billable; page: number }>,
  ): string {
    const params = new URLSearchParams();
    const nextPeriod = overrides.period ?? period;
    const nextBillable = overrides.billable ?? billable;
    const nextPage = overrides.page ?? page;
    if (nextPeriod !== 'week') params.set('period', nextPeriod);
    if (nextBillable !== 'all') params.set('billable', nextBillable);
    if (nextPage > 1) params.set('page', String(nextPage));
    const s = params.toString();
    return s ? `/time?${s}` : '/time';
  }

  return (
    <main className="flex flex-col gap-6 px-8 py-10 sm:px-12 max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-semibold text-text">
            Моё время
          </h1>
          <p className="text-[13px] text-text-muted">
            {result.total === 0
              ? 'За выбранный период записей нет'
              : `Найдено: ${result.total} ${plural(result.total, ['запись', 'записи', 'записей'])}`}
          </p>
        </div>
      </header>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md bg-surface-muted p-1 gap-1">
          {PERIODS.map((p) => (
            <FilterTab
              key={p.value}
              href={buildHref({ period: p.value, page: 1 })}
              active={period === p.value}
            >
              {p.label}
            </FilterTab>
          ))}
        </div>
        <div className="inline-flex rounded-md bg-surface-muted p-1 gap-1">
          {BILLABLES.map((b) => (
            <FilterTab
              key={b.value}
              href={buildHref({ billable: b.value, page: 1 })}
              active={billable === b.value}
            >
              {b.label}
            </FilterTab>
          ))}
        </div>
      </div>

      {/* Summary по странице */}
      {result.items.length > 0 && (
        <Card className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <SummaryCell label="На этой странице" value={formatMinutes(pageTotalMin)} />
          <SummaryCell
            label="Оплачиваемых"
            value={formatMinutes(pageBillableMin)}
            tone={pageBillableMin > 0 ? 'success' : 'muted'}
          />
          <SummaryCell
            label="Сумма (по ставкам entries)"
            value={`${MONEY_FMT.format(pageAmount)} ₴`}
            tone={pageAmount > 0 ? 'success' : 'muted'}
          />
        </Card>
      )}

      {result.items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <DayGroup key={g.key} title={g.label} count={g.entries.length}>
              {g.entries.map((e) => (
                <TimeEntryRowWithCase
                  key={e.id}
                  entry={e}
                  currentUserId={user.profile.id}
                />
              ))}
            </DayGroup>
          ))}
        </div>
      )}

      {result.pageCount > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label="Пагинация"
        >
          <p className="text-[12px] text-text-muted">
            Страница {page} из {result.pageCount} · по {TIME_PAGE_SIZE} на странице
          </p>
          <div className="flex items-center gap-2">
            <PageLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
              ← Назад
            </PageLink>
            <PageLink
              href={buildHref({ page: page + 1 })}
              disabled={page >= result.pageCount}
            >
              Вперёд →
            </PageLink>
          </div>
        </nav>
      )}
    </main>
  );
}

// /time использует TimeEntryRow тот же, что карточка дела, но добавляет
// мини-ссылку на дело в строке (на карточке дела ссылка не нужна).
// Делаем тонкий обёртку — без копирования всей строки.
function TimeEntryRowWithCase({
  entry,
  currentUserId,
}: {
  entry: TimeEntryWithRefs;
  currentUserId: string;
}) {
  const ownEntry = entry.user_id === currentUserId;
  return (
    <div className="relative">
      <TimeEntryRow entry={entry} canDelete={ownEntry} />
      {entry.case && (
        <Link
          href={`/cases/${entry.case.id}`}
          className="absolute top-3 right-12 text-[12px] text-primary hover:underline truncate max-w-[40%] font-medium"
        >
          {entry.case.number_title}
        </Link>
      )}
    </div>
  );
}

function DayGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle flex items-center gap-2">
        {title}
        <span className="font-mono text-text-muted">· {count}</span>
      </h2>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center h-7 px-3 rounded text-[13px] font-medium transition-colors ' +
        (active
          ? 'bg-surface text-text shadow-sm'
          : 'text-text-muted hover:text-text')
      }
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text-subtle bg-surface border border-border rounded-md cursor-not-allowed"
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center h-9 px-3 text-[13px] font-medium text-text bg-surface border border-border-strong rounded-md hover:bg-surface-muted transition-colors"
    >
      {children}
    </Link>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'muted';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'muted'
        ? 'text-text-muted'
        : 'text-text';
  return (
    <div className="p-5 flex flex-col gap-1.5">
      <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        {label}
      </p>
      <p className={`text-[20px] font-bold font-mono tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface rounded-lg border border-border shadow-sm py-16 px-6 flex flex-col items-center text-center">
      <span
        className="inline-flex w-12 h-12 items-center justify-center rounded-full text-primary bg-primary-subtle mb-4"
        aria-hidden="true"
      >
        <Clock size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-[18px] font-semibold text-text mb-1">
        Здесь будут ваши часы
      </h2>
      <p className="text-[13px] text-text-muted max-w-md">
        Залогируйте время в карточке дела — оно появится тут с фильтром по
        периоду и оплачиваемости.
      </p>
    </div>
  );
}

// =====================================================================
// Группировка entries по дате (так же, как tasks в /tasks).
// =====================================================================
type Group = { key: string; label: string; entries: TimeEntryWithRefs[] };

function groupByDay(entries: TimeEntryWithRefs[]): Group[] {
  const byDate = new Map<string, TimeEntryWithRefs[]>();
  for (const e of entries) {
    const arr = byDate.get(e.spent_at) ?? [];
    arr.push(e);
    byDate.set(e.spent_at, arr);
  }
  // Сохраняем порядок — entries уже отсортированы spent_at desc.
  const groups: Group[] = [];
  for (const [date, list] of byDate) {
    groups.push({
      key: date,
      label: DATE_FMT.format(new Date(date + 'T00:00:00Z')),
      entries: list,
    });
  }
  return groups;
}

function computeRange(period: Period): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (period === 'all') return {};
  const today = new Date();
  const tIso = today.toISOString().slice(0, 10);
  if (period === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: first.toISOString().slice(0, 10), dateTo: tIso };
  }
  // week — последние 7 дней включая сегодня (без хитрых ISO-week, простой UX).
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  return { dateFrom: weekAgo.toISOString().slice(0, 10), dateTo: tIso };
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

