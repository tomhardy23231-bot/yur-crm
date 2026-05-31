'use client';

import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  CAPABILITY_HINTS,
  canGrantCapability,
  capRoleDefault,
  type Capability,
  type EffectiveCaps,
  type PermOverrides,
  type Role,
} from '@/lib/types/db';

type TriState = 'inherit' | 'grant' | 'revoke';

function overrideToState(value: boolean | undefined): TriState {
  if (value === true) return 'grant';
  if (value === false) return 'revoke';
  return 'inherit';
}

// Набор tri-state контролов по каждому настраиваемому праву. Рендерит скрытые
// поля cap_<key> ∈ inherit|grant|revoke, которые читает сервер
// (collectPermOverrides). Показываются только права, которые актор ВПРАВЕ выдать
// целевой роли (canGrantCapability) — иначе строка скрыта (страж — БД-триггер).
//
// targetRole управляет дефолтной подписью «наследует (—)». Для формы создания
// он приходит из выбранной роли (см. UserCreateForm), для строки — из роли цели.
export function UserPermsFields({
  actorRole,
  actorCaps,
  targetRole,
  current = {},
  idPrefix,
}: {
  actorRole: Role;
  actorCaps: EffectiveCaps;
  targetRole: Role;
  current?: PermOverrides;
  idPrefix: string;
}) {
  const editable = CAPABILITIES.filter((cap) =>
    canGrantCapability(cap, actorRole, actorCaps, targetRole, false),
  );

  if (editable.length === 0) {
    return (
      <p className="text-[12.5px] text-text-muted">
        Для этой роли нет прав, которые вы можете настроить.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {editable.map((cap) => (
        <CapField
          key={cap}
          cap={cap}
          targetRole={targetRole}
          initial={overrideToState(current[cap])}
          id={`${idPrefix}-${cap}`}
        />
      ))}
    </div>
  );
}

function CapField({
  cap,
  targetRole,
  initial,
  id,
}: {
  cap: Capability;
  targetRole: Role;
  initial: TriState;
  id: string;
}) {
  const roleDefault = capRoleDefault(cap, targetRole);
  const inheritLabel = `Наследует (${roleDefault ? 'разрешено' : 'запрещено'})`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-[13px] font-medium text-text">
          {CAPABILITY_LABELS[cap]}
        </label>
        <p className="text-[11.5px] text-text-muted">{CAPABILITY_HINTS[cap]}</p>
      </div>
      <select
        id={id}
        name={`cap_${cap}`}
        defaultValue={initial}
        className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-[12.5px] text-text outline-none transition-colors hover:border-border-strong focus:border-primary"
      >
        <option value="inherit">{inheritLabel}</option>
        <option value="grant">Разрешено</option>
        <option value="revoke">Запрещено</option>
      </select>
    </div>
  );
}
