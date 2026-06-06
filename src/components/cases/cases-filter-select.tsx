'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Select } from '@/components/ui/select';

interface CasesFilterSelectProps {
  name: string;
  value: string;
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

// Нативный Select, навигирует через router.replace.
// НЕ внутри <form> (иначе hydration error: CasesSearch уже сам <form>).
export function CasesFilterSelect({
  name,
  value,
  ariaLabel,
  options,
}: CasesFilterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <label className="inline-flex w-auto min-w-40 shrink-0" aria-label={ariaLabel}>
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
            router.replace(s ? `/cases?${s}` : '/cases');
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
