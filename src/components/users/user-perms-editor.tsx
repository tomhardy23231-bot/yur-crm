'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
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
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);

  // Сколько прав реально настраиваемо актором для этой роли.
  const editableCount = CAPABILITIES.filter((cap) =>
    canGrantCapability(cap, actorRole, actorCaps, targetRole, false),
  ).length;

  if (editableCount === 0) {
    return <span className="text-[12px] text-text-subtle">{t.common.dash}</span>;
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
        {overriddenCount > 0
          ? fmt(t.users.perms.buttonCount, { n: overriddenCount })
          : t.users.perms.button}
      </Button>

      {open && (
        <form
          action={updateUserPermsAction}
          className="w-[min(420px,80vw)] rounded-lg border border-border bg-surface-muted/40 p-3.5 text-left shadow-sm"
        >
          <input type="hidden" name="user_id" value={userId} />
          <p className="mb-2.5 text-[12px] text-text-muted">
            {t.users.perms.editIntroPrefix}{' '}
            <span className="font-medium text-text">{userName}</span>
            {t.users.perms.editIntroSuffix}
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
              {t.common.cancel}
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
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? t.common.saving : t.common.save}
    </Button>
  );
}
