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
    // НЕ <label>: aria-label на <label> не доходит до вложенного <select> (его
    // имя берётся из текста label/aria на самом контроле). Имя ставим прямо на
    // Select (он прокидывает props на нативный <select>). key привязан к value —
    // при смене URL (фильтр/сброс/сортировка) Select ремаунтится и снова берёт
    // defaultValue, иначе uncontrolled-селект показывал бы устаревшее значение.
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
            router.replace(s ? `/cases?${s}` : '/cases');
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
