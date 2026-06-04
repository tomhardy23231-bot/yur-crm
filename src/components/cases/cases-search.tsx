'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';

export function CasesSearch({ initial }: { initial: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function submit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('q', next);
    else params.delete('q');
    params.delete('page');
    startTransition(() => {
      router.replace(`/cases?${params.toString()}`);
    });
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
      className="relative flex-1 max-w-md"
    >
      <Search
        size={16}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t.cases.toolbar.searchPlaceholder}
        className="pl-9"
        aria-label={t.cases.toolbar.searchAria}
      />
    </form>
  );
}
