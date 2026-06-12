'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { SALARY_MODES, type SalaryMode } from '@/lib/types/db';
import { updateUserSalaryAction } from '@/lib/users/actions';

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Раскрывающийся редактор режима зарплаты и оклада для строки пользователя.
// Менять может owner / admin своего подразделения (canEdit зеркалит БД-гард
// users_guard_salary_fields). Для не-редактируемых строк — read-only отображение.
export function UserSalaryEditor({
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SalaryMode>(salaryMode);

  // Краткая подпись текущего состояния (для кнопки/неизменяемой ячейки).
  const summary =
    salaryMode === 'percent'
      ? t.users.salary.none
      : t.enums.salaryMode[salaryMode] +
        (fixedAmount != null
          ? ` · ${t.users.salary.perMonth.replace('{amount}', MONEY.format(fixedAmount))}`
          : '');

  if (!canEdit) {
    return (
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] text-text">{summary}</span>
      </span>
    );
  }

  const showFixed = mode !== 'percent';

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-left text-[13px] text-text hover:text-primary transition-colors"
      >
        <Wallet size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        <span>{summary}</span>
      </button>

      {open && (
        <form
          action={updateUserSalaryAction}
          className="w-[min(360px,80vw)] rounded-lg border border-border bg-surface-muted/40 p-3.5 text-left shadow-sm"
        >
          <input type="hidden" name="user_id" value={userId} />

          <div className="mb-3 flex flex-col gap-1.5">
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
            <p className="text-[12px] text-text-muted">
              {t.enums.salaryModeHint[mode]}
            </p>
          </div>

          {showFixed && (
            <div className="mb-1 flex flex-col gap-1.5">
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

          <p className="mt-2 text-[12px] text-text-subtle">{t.users.salary.hint}</p>

          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <SaveButton />
          </div>
        </form>
      )}
    </div>
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
