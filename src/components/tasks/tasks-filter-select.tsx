'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Select } from '@/components/ui/select';

interface TasksFilterSelectProps {
  name: string;
  value: string;
  ariaLabel: string;
  basePath: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function TasksFilterSelect({
  name,
  value,
  ariaLabel,
  basePath,
  options,
}: TasksFilterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    // НЕ <label>: aria-label на <label> не доходит до Radix-триггера (button).
    // key привязан к value — при смене URL (фильтр/сброс) Select ремаунтится и
    // снова берёт defaultValue. См. cases-filter-select.tsx.
    <div className="inline-flex w-auto shrink-0">
      <Select
        key={`${name}-${value}`}
        name={name}
        defaultValue={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = e.currentTarget.value;
          const params = new URLSearchParams(searchParams.toString());
          if (next) params.set(name, next);
          else params.delete(name);
          params.delete('page');
          startTransition(() => {
            const s = params.toString();
            router.replace(s ? `${basePath}?${s}` : basePath);
          });
        }}
        className="!w-auto h-8 gap-1 pl-2.5 pr-2 text-[13px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
