'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Input } from '@/components/ui/input';

// Фильтр вкладки «Архив» по дате закрытия дела (closed_at): два поля «с / по».
// Навигирует через router.replace (как CasesFilterSelect), сбрасывая page.
// НЕ внутри <form> (CasesSearch — единственный <form> в тулбаре). Рендерится
// только на вкладке «Архив», поэтому пустые closed_from/closed_to за её
// пределами не мешают.
export function CasesDateFilter({
  from,
  to,
  fromLabel,
  toLabel,
  fromAria,
  toAria,
}: {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  fromAria: string;
  toAria: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const update = (name: 'closed_from' | 'closed_to', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete('page');
    startTransition(() => {
      const s = params.toString();
      router.replace(s ? `/cases?${s}` : '/cases');
    });
  };

  const fieldClass = '!h-8 w-auto px-2.5 text-[13px]';

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <span className="whitespace-nowrap text-[12px] text-text-muted">
        {fromLabel}
      </span>
      <Input
        type="date"
        aria-label={fromAria}
        defaultValue={from}
        max={to || undefined}
        onChange={(e) => update('closed_from', e.currentTarget.value)}
        className={fieldClass}
      />
      <span className="whitespace-nowrap text-[12px] text-text-muted">
        {toLabel}
      </span>
      <Input
        type="date"
        aria-label={toAria}
        defaultValue={to}
        min={from || undefined}
        onChange={(e) => update('closed_to', e.currentTarget.value)}
        className={fieldClass}
      />
    </div>
  );
}
