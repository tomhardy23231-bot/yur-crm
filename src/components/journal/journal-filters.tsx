'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';

// Фильтры журнала (/journal): сотрудник, тип события (группа), период.
// Навигация через router.replace (паттерн CasesFilterSelect/CasesDateFilter);
// смена любого фильтра сбрасывает limit «Показать ещё» (лента заново).

export type JournalFilterState = {
  user: string;
  type: string;
  from: string;
  to: string;
};

export function JournalFilters({
  state,
  users,
  groups,
}: {
  state: JournalFilterState;
  users: ReadonlyArray<{ value: string; label: string }>;
  groups: ReadonlyArray<{ value: string; label: string }>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const update = (name: keyof JournalFilterState, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete('limit');
    startTransition(() => {
      const s = params.toString();
      router.replace(s ? `/journal?${s}` : '/journal');
    });
  };

  const hasFilters = Boolean(state.user || state.type || state.from || state.to);
  const selectClass = '!w-auto h-8 gap-1 pl-2.5 pr-2 text-[13px]';
  const dateClass = '!h-8 w-auto px-2.5 text-[13px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex w-auto shrink-0">
        <Select
          key={`user-${state.user}`}
          name="user"
          defaultValue={state.user}
          aria-label={t.journal.filters.userAria}
          onChange={(e) => update('user', e.currentTarget.value)}
          className={selectClass}
        >
          <option value="">{t.journal.filters.allUsers}</option>
          {users.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="inline-flex w-auto shrink-0">
        <Select
          key={`type-${state.type}`}
          name="type"
          defaultValue={state.type}
          aria-label={t.journal.filters.groupAria}
          onChange={(e) => update('type', e.currentTarget.value)}
          className={selectClass}
        >
          <option value="">{t.journal.filters.allGroups}</option>
          {groups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="inline-flex shrink-0 items-center gap-1.5">
        <span className="whitespace-nowrap text-[12px] text-text-muted">
          {t.journal.filters.fromLabel}
        </span>
        <Input
          type="date"
          aria-label={t.journal.filters.fromAria}
          defaultValue={state.from}
          max={state.to || undefined}
          onChange={(e) => update('from', e.currentTarget.value)}
          className={dateClass}
        />
        <span className="whitespace-nowrap text-[12px] text-text-muted">
          {t.journal.filters.toLabel}
        </span>
        <Input
          type="date"
          aria-label={t.journal.filters.toAria}
          defaultValue={state.to}
          min={state.from || undefined}
          onChange={(e) => update('to', e.currentTarget.value)}
          className={dateClass}
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace('/journal'))}
          className="inline-flex h-8 shrink-0 items-center rounded-chip px-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed"
        >
          {t.journal.filters.reset}
        </button>
      )}
    </div>
  );
}
