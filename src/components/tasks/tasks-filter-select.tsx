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
    <label className="inline-flex w-auto min-w-40" aria-label={ariaLabel}>
      <Select
        name={name}
        defaultValue={value}
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
        className="!w-auto"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
