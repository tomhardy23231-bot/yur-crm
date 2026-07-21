'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Select } from '@/components/ui/select';

// Селект «по N на сторінці» в нижней панели списка дел. Выбор запоминается за
// пользователем в cookie (год): сервер читает её при каждом рендере страницы,
// поэтому в URL размер не попадает. Смена размера сбрасывает на 1-ю страницу.
export const CASES_PAGE_SIZE_COOKIE = 'cases_page_size';

export function CasesPageSize({
  value,
  options,
  ariaLabel,
}: {
  value: number;
  options: ReadonlyArray<{ value: number; label: string }>;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="inline-flex w-auto shrink-0">
      <Select
        key={`per-${value}`}
        name="per_page"
        defaultValue={String(value)}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = e.currentTarget.value;
          document.cookie = `${CASES_PAGE_SIZE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          const params = new URLSearchParams(searchParams.toString());
          params.delete('page');
          startTransition(() => {
            const s = params.toString();
            router.replace(s ? `${pathname}?${s}` : pathname);
            // URL мог не измениться (page и так не было) — refresh гарантирует
            // серверный ререндер уже с новой cookie.
            router.refresh();
          });
        }}
        className="!w-auto h-8 gap-1 pl-2.5 pr-2 text-[13px]"
      >
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
