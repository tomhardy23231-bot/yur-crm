'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import type { Department } from '@/lib/types/db';

// Фильтр «Подразделение» для отчёта ЗП. Навигирует по текущему пути, сохраняя
// остальные параметры (?month). Показывается только тем, кто видит >1 (owner /
// staff со scope='all' либо department_id IS NULL).
export function PayrollDepartmentFilter({
  value,
  departments,
}: {
  value: string;
  departments: ReadonlyArray<Department>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="inline-flex w-auto shrink-0">
      <Select
        key={`department-${value}`}
        name="department"
        defaultValue={value}
        aria-label={t.payroll.report.departmentAria}
        onChange={(e) => {
          const next = e.currentTarget.value;
          const params = new URLSearchParams(searchParams.toString());
          if (next) params.set('department', next);
          else params.delete('department');
          startTransition(() => {
            const s = params.toString();
            router.replace(s ? `${pathname}?${s}` : pathname);
          });
        }}
        className="!w-auto h-9 gap-1 pl-3 pr-2 text-[13px]"
      >
        <option value="">{t.payroll.report.allDepartments}</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
