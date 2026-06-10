'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Building2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import {
  VISIBILITY_SCOPES,
  type Department,
  type VisibilityScope,
} from '@/lib/types/db';
import { assignUserDepartmentAction } from '@/lib/users/actions';

// Раскрывающийся редактор подразделения / должности / скоупа для строки пользователя.
// department_id и visibility_scope — только owner (actorIsOwner); position — любой
// обладатель manage_users. БД-гард users_guard_visibility_fields дублирует.
export function UserAssignmentEditor({
  userId,
  departmentId,
  departmentName,
  position,
  visibilityScope,
  showsScope,
  departments,
  actorIsOwner,
}: {
  userId: string;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  visibilityScope: VisibilityScope;
  // true — у роли действует скоуп (admin/office_manager); иначе скоуп не показываем.
  showsScope: boolean;
  departments: ReadonlyArray<Department>;
  actorIsOwner: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Опции подразделения: «вне структуры» + активные; текущее (вдруг скрытое) —
  // добавляем, чтобы селект показал актуальное значение.
  const deptOptions = [
    { value: '', label: t.departments.assign.noDepartment },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];
  if (departmentId && !departments.some((d) => d.id === departmentId)) {
    deptOptions.push({
      value: departmentId,
      label: departmentName ?? departmentId,
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-left text-[13px] text-text hover:text-primary transition-colors"
      >
        <Building2 size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        <span className="flex flex-col leading-tight">
          <span>{departmentName ?? t.departments.assign.none}</span>
          {position && (
            <span className="text-[12px] text-text-muted">{position}</span>
          )}
        </span>
      </button>

      {open && (
        <form
          action={assignUserDepartmentAction}
          className="w-[min(360px,80vw)] rounded-lg border border-border bg-surface-muted/40 p-3.5 text-left shadow-sm"
        >
          <input type="hidden" name="user_id" value={userId} />

          {actorIsOwner && (
            <div className="mb-3 flex flex-col gap-1.5">
              <Label
                htmlFor={`assign-dept-${userId}`}
                className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
              >
                {t.departments.assign.departmentLabel}
              </Label>
              <Select
                id={`assign-dept-${userId}`}
                name="department_id"
                defaultValue={departmentId ?? ''}
                aria-label={t.departments.assign.departmentLabel}
                className="h-9"
              >
                {deptOptions.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {actorIsOwner && showsScope && (
            <div className="mb-3 flex flex-col gap-1.5">
              <Label
                htmlFor={`assign-scope-${userId}`}
                className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
              >
                {t.departments.assign.scopeLabel}
              </Label>
              <Select
                id={`assign-scope-${userId}`}
                name="visibility_scope"
                defaultValue={visibilityScope}
                aria-label={t.departments.assign.scopeLabel}
                className="h-9"
              >
                {VISIBILITY_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t.enums.visibilityScope[s]}
                  </option>
                ))}
              </Select>
              <p className="text-[12px] text-text-muted">
                {t.enums.visibilityScopeHint[visibilityScope]}
              </p>
            </div>
          )}

          <div className="mb-1 flex flex-col gap-1.5">
            <Label
              htmlFor={`assign-pos-${userId}`}
              className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
            >
              {t.departments.assign.positionLabel}
            </Label>
            <Input
              id={`assign-pos-${userId}`}
              name="position"
              type="text"
              maxLength={120}
              defaultValue={position ?? ''}
              placeholder={t.departments.assign.positionPlaceholder}
              className="h-9"
            />
            <p className="text-[12px] text-text-muted">
              {t.departments.assign.positionHint}
            </p>
          </div>

          {!actorIsOwner && (
            <p className="mt-2 text-[12px] text-text-subtle">
              {t.departments.assign.scopeOwnerOnly}
            </p>
          )}

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
      {pending ? t.common.saving : t.common.save}
    </Button>
  );
}
