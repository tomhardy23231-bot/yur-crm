'use client';

import { useFormStatus } from 'react-dom';

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

// Секция «Подразделение и должность» карточки сотрудника — развёрнутая форма
// (в отличие от прежнего раскрывающегося редактора строки). department_id и
// visibility_scope меняет только owner; position — любой обладатель
// manage_users. БД-гард users_guard_visibility_fields дублирует.
export function UserAssignmentSection({
  userId,
  departmentId,
  departmentName,
  position,
  visibilityScope,
  showsScope,
  departments,
  actorIsOwner,
  canEdit,
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
  canEdit: boolean;
}) {
  const { t } = useI18n();

  if (!canEdit) {
    return (
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-text-muted">{t.departments.assign.departmentLabel}</dt>
        <dd className="text-text">{departmentName ?? t.departments.assign.none}</dd>
        {showsScope && (
          <>
            <dt className="text-text-muted">{t.departments.assign.scopeLabel}</dt>
            <dd className="text-text">{t.enums.visibilityScope[visibilityScope]}</dd>
          </>
        )}
        <dt className="text-text-muted">{t.departments.assign.positionLabel}</dt>
        <dd className="text-text">{position ?? t.common.dash}</dd>
      </dl>
    );
  }

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
    <form action={assignUserDepartmentAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="user_id" value={userId} />

      {actorIsOwner ? (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`assign-dept-${userId}`}
            className="text-[12px] text-text-muted"
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
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-text-muted">
            {t.departments.assign.departmentLabel}
          </span>
          <span className="text-[13px] text-text">
            {departmentName ?? t.departments.assign.none}
          </span>
        </div>
      )}

      {actorIsOwner && showsScope && (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`assign-scope-${userId}`}
            className="text-[12px] text-text-muted"
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

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`assign-pos-${userId}`}
          className="text-[12px] text-text-muted"
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
        <p className="text-[12px] text-text-subtle">
          {t.departments.assign.scopeOwnerOnly}
        </p>
      )}

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
      {pending ? t.common.saving : t.common.save}
    </Button>
  );
}
