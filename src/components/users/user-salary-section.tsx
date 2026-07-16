'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { formatMoney } from '@/lib/utils';
import { SALARY_MODES, type SalaryMode } from '@/lib/types/db';
import { updateUserSalaryAction } from '@/lib/users/actions';

// Секция «Зарплата» карточки сотрудника — развёрнутая форма режима и оклада.
// Менять может owner / admin своего подразделения (canEdit зеркалит БД-гард
// users_guard_salary_fields). Для остальных — read-only отображение.
export function UserSalarySection({
  userId,
  salaryMode,
  fixedAmount,
  canEdit,
}: {
  userId: string;
  salaryMode: SalaryMode;
  fixedAmount: number | null;
  canEdit: boolean;
}) {
  const { t, fmt } = useI18n();
  const [mode, setMode] = useState<SalaryMode>(salaryMode);

  if (!canEdit) {
    const summary =
      salaryMode === 'percent'
        ? t.users.salary.none
        : `${t.enums.salaryMode[salaryMode]}${
            fixedAmount != null
              ? ` · ${fmt(t.users.salary.perMonth, { amount: formatMoney(fixedAmount) })}`
              : ''
          }`;
    return (
      <div className="flex flex-col gap-2 text-[13px]">
        <span className="text-text">{summary}</span>
        <p className="text-[12px] text-text-subtle">
          {t.users.salary.ownerOrDeptAdmin}
        </p>
      </div>
    );
  }

  const showFixed = mode !== 'percent';

  return (
    <form action={updateUserSalaryAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="user_id" value={userId} />

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`salary-mode-${userId}`}
          className="text-[12px] text-text-muted"
        >
          {t.users.salary.modeLabel}
        </Label>
        <Select
          id={`salary-mode-${userId}`}
          name="salary_mode"
          defaultValue={salaryMode}
          onChange={(e) => setMode(e.target.value as SalaryMode)}
          aria-label={t.users.salary.modeLabel}
          className="h-9"
        >
          {SALARY_MODES.map((m) => (
            <option key={m} value={m}>
              {t.enums.salaryMode[m]}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-text-muted">{t.enums.salaryModeHint[mode]}</p>
      </div>

      {showFixed && (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`salary-fixed-${userId}`}
            className="text-[12px] text-text-muted"
          >
            {t.users.salary.fixedLabel}
          </Label>
          <Input
            id={`salary-fixed-${userId}`}
            name="salary_fixed_amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            defaultValue={fixedAmount ?? ''}
            placeholder={t.users.salary.fixedPlaceholder}
            className="h-9 tabular-nums"
          />
        </div>
      )}

      <p className="text-[12px] text-text-subtle">{t.users.salary.hint}</p>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? t.common.saving : t.users.salary.save}
    </Button>
  );
}
