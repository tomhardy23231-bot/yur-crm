'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';

// Живой поиск (21.07): запрос уходит сам через 350мс после остановки ввода,
// Enter — мгновенно. Повторный сабмит того же значения не дёргает навигацию.
const DEBOUNCE_MS = 350;

export function CasesSearch({ initial }: { initial: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmitted = useRef(initial);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function submit(next: string) {
    if (timer.current) clearTimeout(timer.current);
    if (next === lastSubmitted.current) return;
    lastSubmitted.current = next;
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
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => submit(next), DEBOUNCE_MS);
        }}
        placeholder={t.cases.toolbar.searchPlaceholder}
        className="pl-9"
        aria-label={t.cases.toolbar.searchAria}
      />
    </form>
  );
}
