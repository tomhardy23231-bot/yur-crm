'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CAPABILITIES,
  canGrantCapability,
  effectiveCap,
  type EffectiveCaps,
  type PermOverrides,
  type Role,
} from '@/lib/types/db';
import { updateUserPermsAction } from '@/lib/users/actions';

import { UserPermsFields } from './user-perms-fields';

// Раскрывающийся редактор персональных прав для строки пользователя.
// Кнопка «Права (N)» открывает форму с tri-state контролами и «Сохранить».
// Сохранение идёт через updateUserPermsAction; БД-страж дублирует проверки.
export function UserPermsEditor({
  userId,
  userName,
  targetRole,
  current,
  actorRole,
  actorCaps,
}: {
  userId: string;
  userName: string;
  targetRole: Role;
  current: PermOverrides;
  actorRole: Role;
  actorCaps: EffectiveCaps;
}) {
  const [open, setOpen] = useState(false);

  // Сколько прав реально настраиваемо актором для этой роли.
  const editableCount = CAPABILITIES.filter((cap) =>
    canGrantCapability(cap, actorRole, actorCaps, targetRole, false),
  ).length;

  if (editableCount === 0) {
    return <span className="text-[12px] text-text-subtle">—</span>;
  }

  // Сколько прав сейчас переопределено (отличается от дефолта роли).
  const overriddenCount = CAPABILITIES.filter((cap) => {
    const ov = current[cap];
    return typeof ov === 'boolean' && ov !== effectiveCapDefault(cap, targetRole);
  }).length;

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ShieldCheck size={14} strokeWidth={1.75} />
        Права{overriddenCount > 0 ? ` (${overriddenCount})` : ''}
      </Button>

      {open && (
        <form
          action={updateUserPermsAction}
          className="w-[min(420px,80vw)] rounded-lg border border-border bg-surface-muted/40 p-3.5 text-left shadow-sm"
        >
          <input type="hidden" name="user_id" value={userId} />
          <p className="mb-2.5 text-[12px] text-text-muted">
            Персональные права для <span className="font-medium text-text">{userName}</span>.
            «Наследует» — как у роли по умолчанию.
          </p>
          <UserPermsFields
            actorRole={actorRole}
            actorCaps={actorCaps}
            targetRole={targetRole}
            current={current}
            idPrefix={`perm-${userId}`}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <SaveButton />
          </div>
        </form>
      )}
    </div>
  );
}

function effectiveCapDefault(
  cap: Parameters<typeof effectiveCap>[0],
  role: Role,
): boolean {
  // Дефолт роли без оверрайдов.
  return effectiveCap(cap, role, {});
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Сохранение…' : 'Сохранить'}
    </Button>
  );
}
