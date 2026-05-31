'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ROLE_LABEL, type Role } from '@/lib/types/db';
import { changeUserRoleAction, setUserActiveAction } from '@/lib/users/actions';

// Селект роли в строке таблицы. Авто-сабмит при выборе. Если строку нельзя
// менять (ступенчатые права / это сам актор) — показываем роль как бейдж.
// Задача 9b: у деактивированного пользователя роль менять нельзя — сначала
// реактивировать (показываем роль бейджем с подсказкой).
export function UserRoleControl({
  userId,
  currentRole,
  assignableRoles,
  manageable,
  isActive = true,
}: {
  userId: string;
  currentRole: Role;
  assignableRoles: ReadonlyArray<Role>;
  manageable: boolean;
  isActive?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (!manageable || !isActive) {
    return (
      <Badge
        tone="neutral"
        title={
          manageable && !isActive
            ? 'Сначала реактивируйте сотрудника, чтобы изменить роль'
            : undefined
        }
      >
        {ROLE_LABEL[currentRole]}
      </Badge>
    );
  }

  return (
    <form ref={formRef} action={changeUserRoleAction} className="inline-flex">
      <input type="hidden" name="user_id" value={userId} />
      <Select
        name="role"
        defaultValue={currentRole}
        aria-label="Роль пользователя"
        className="h-9 min-w-[160px]"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {assignableRoles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Select>
    </form>
  );
}

// Кнопка деактивации/реактивации. Деактивация не удаляет данные — помечает
// is_active. Если строку нельзя менять — «это вы» / «—».
export function UserActiveControl({
  userId,
  isActive,
  manageable,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  manageable: boolean;
  isSelf: boolean;
}) {
  if (!manageable) {
    return (
      <span className="text-[12px] text-text-subtle">{isSelf ? 'это вы' : '—'}</span>
    );
  }

  return (
    <form action={setUserActiveAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="active" value={isActive ? 'false' : 'true'} />
      <ActiveSubmit isActive={isActive} />
    </form>
  );
}

function ActiveSubmit({ isActive }: { isActive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={isActive ? 'ghost' : 'secondary'}
      size="sm"
      disabled={pending}
    >
      {isActive ? 'Деактивировать' : 'Реактивировать'}
    </Button>
  );
}
