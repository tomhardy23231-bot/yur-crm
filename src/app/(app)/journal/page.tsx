import Link from 'next/link';
import { History, SearchX } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { JournalFilters } from '@/components/journal/journal-filters';
import { JournalRow } from '@/components/journal/journal-row';
import { requireUser } from '@/lib/auth/require-role';
import {
  JOURNAL_GROUP_KEYS,
  JOURNAL_LIMIT_CAP,
  JOURNAL_PAGE_SIZE,
  isJournalGroup,
  kyivDayKey,
  listJournal,
  listJournalUsers,
  resolveJournalTargets,
  type JournalGroup,
} from '@/lib/activity-log/journal';
import {
  resolveActivityNames,
  type ActivityLogEntry,
} from '@/lib/activity-log/queries';
import { collectActivityIds } from '@/lib/activity-log/format';
import { kyivToday } from '@/lib/payroll/month';
import { getT } from '@/lib/i18n/server';
import { LOCALE_BCP47, type Locale } from '@/lib/i18n/config';
import { UUID_RE } from '@/lib/validation';

// ============================================================================
// «Журнал» — глобальная лента активности: кто, что и когда сделал во всей
// системе. Страница видна всем; СОСТАВ событий режет RLS (activity_log):
// owner — всё (вкл. кассу/ставки/входы/отпуска, миграция 0006), керівник и
// офис-менеджер — свой скоуп, юрист/эксперт — события своих дел.
// ============================================================================

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.journal.metaTitle };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Время события (HH:MM, Киев) — дату даёт заголовок дня.
function timeFmt(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Заголовок дня: «21 июля, понедельник» (+ год, если не текущий).
function dayLabelFmt(locale: Locale, withYear: boolean): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    user?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: string;
  }>;
}) {
  const user = await requireUser();
  const i18n = await getT();
  const { t, fmt, plural, locale } = i18n;

  const sp = await searchParams;
  const filterUser = sp.user && UUID_RE.test(sp.user) ? sp.user : '';
  const filterType: JournalGroup | '' =
    sp.type && isJournalGroup(sp.type) ? sp.type : '';
  const filterFrom = sp.from && DAY_RE.test(sp.from) ? sp.from : '';
  const filterTo = sp.to && DAY_RE.test(sp.to) ? sp.to : '';
  const limitRaw = Number(sp.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), JOURNAL_PAGE_SIZE), JOURNAL_LIMIT_CAP)
    : JOURNAL_PAGE_SIZE;

  const [{ entries, hasMore }, usersList] = await Promise.all([
    listJournal({
      userId: filterUser || undefined,
      group: filterType || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
      limit,
    }),
    listJournalUsers(),
  ]);

  // Имена для текста события (UUID в changes → ФИО/клиент) и цели-ссылки.
  const { userIds, clientIds } = collectActivityIds(entries);
  const [nameById, targets] = await Promise.all([
    resolveActivityNames(userIds, clientIds),
    resolveJournalTargets(entries),
  ]);
  // Имена сотрудников-целей пригодны и для текста (absence/payroll-события).
  const names = new Map(nameById);
  for (const [id, name] of targets.userById) if (!names.has(id)) names.set(id, name);

  // Группировка по киевским дням (записи уже отсортированы desc).
  const days: Array<{ key: string; entries: ActivityLogEntry[] }> = [];
  for (const entry of entries) {
    const key = kyivDayKey(entry.created_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else days.push({ key, entries: [entry] });
  }

  const today = kyivToday();
  const yesterday = (() => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
  })();
  const currentYear = today.slice(0, 4);
  const time = timeFmt(locale);

  const dayLabel = (key: string): string => {
    if (key === today) return t.journal.today;
    if (key === yesterday) return t.journal.yesterday;
    const label = dayLabelFmt(locale, key.slice(0, 4) !== currentYear).format(
      new Date(`${key}T12:00:00`),
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const scopeNote =
    user.profile.role === 'owner'
      ? t.journal.scopeOwner
      : user.profile.role === 'admin' || user.profile.role === 'office_manager'
        ? t.journal.scopeStaff
        : t.journal.scopeSelf;

  const hasFilters = Boolean(filterUser || filterType || filterFrom || filterTo);

  // Ссылка «Показать ещё»: те же фильтры, limit больше на страницу.
  const moreParams = new URLSearchParams();
  if (filterUser) moreParams.set('user', filterUser);
  if (filterType) moreParams.set('type', filterType);
  if (filterFrom) moreParams.set('from', filterFrom);
  if (filterTo) moreParams.set('to', filterTo);
  moreParams.set('limit', String(Math.min(limit + JOURNAL_PAGE_SIZE, JOURNAL_LIMIT_CAP)));

  return (
    <main className="flex flex-col gap-4 px-3 py-2 sm:px-4">
      {/* Шапка страницы */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-subtle text-primary">
            <History size={18} strokeWidth={2} />
          </span>
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">
            {t.journal.title}
          </h1>
        </div>
        <p className="text-[13.5px] text-text-muted">
          {t.journal.subtitle}{' '}
          <span className="text-text-subtle">{scopeNote}</span>
        </p>
      </div>

      {/* Фильтры */}
      <JournalFilters
        state={{ user: filterUser, type: filterType, from: filterFrom, to: filterTo }}
        users={usersList.map((u) => ({ value: u.id, label: u.full_name }))}
        groups={JOURNAL_GROUP_KEYS.map((g) => ({ value: g, label: t.journal.groups[g] }))}
      />

      {/* Лента по дням */}
      {days.length === 0 ? (
        <Card>
          <EmptyState
            icon={hasFilters ? SearchX : History}
            title={hasFilters ? t.journal.empty.filteredTitle : t.journal.empty.title}
            hint={hasFilters ? t.journal.empty.filteredHint : t.journal.empty.hint}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <Card key={day.key}>
              {/* Шапка дня */}
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                <h2 className="text-[14px] font-semibold text-text">
                  {dayLabel(day.key)}
                </h2>
                <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-primary-pressed">
                  {plural(t.journal.dayCount, day.entries.length)}
                </span>
              </div>

              {/* События дня */}
              <ol className="flex flex-col">
                {day.entries.map((entry) => {
                  const at = new Date(entry.created_at);
                  return (
                    <JournalRow
                      key={entry.id}
                      entry={entry}
                      i18n={i18n}
                      names={names}
                      targets={targets}
                      time={time.format(at)}
                      timeTitle={at.toLocaleString(LOCALE_BCP47[locale])}
                    />
                  );
                })}
              </ol>
            </Card>
          ))}

          {/* Вглубь истории */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <p className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-text-subtle">
              {fmt(t.journal.shownCount, { n: entries.length })}
            </p>
            {hasMore && limit < JOURNAL_LIMIT_CAP && (
              <Link
                href={`/journal?${moreParams.toString()}`}
                scroll={false}
                className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-5 text-[13.5px] font-semibold text-text transition-colors hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed"
              >
                {t.journal.showMore}
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
