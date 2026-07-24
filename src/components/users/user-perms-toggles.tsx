'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CapHelpButton } from '@/components/users/cap-help-button';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import {
  CAPABILITIES,
  canGrantCapability,
  capRoleDefault,
  effectiveCap,
  type Capability,
  type EffectiveCaps,
  type PermOverrides,
  type Role,
} from '@/lib/types/db';
import { updateUserPermsAction } from '@/lib/users/actions';

// Группировка прав по темам — порядок показа на карточке сотрудника.
const PERM_GROUPS: ReadonlyArray<{
  key: 'cases' | 'finance' | 'admin';
  caps: readonly Capability[];
}> = [
  {
    key: 'cases',
    caps: [
      'view_all_cases',
      'create_cases',
      'delete_cases',
      'create_clients',
      'delete_clients',
      'delete_documents',
    ],
  },
  {
    key: 'finance',
    caps: [
      'edit_payments',
      'delete_payments',
      'view_all_payroll',
      'edit_rate_overrides',
      'view_cash',
      'can_manage_cash',
    ],
  },
  {
    key: 'admin',
    caps: [
      'create_users',
      'manage_users',
      'edit_payroll_rates',
      'manage_case_types',
    ],
  },
];

// Тумблеры персональных прав (карточка /settings/users/[id]). Показывают
// ЭФФЕКТИВНОЕ значение (роль + личное переопределение); «наследует» наружу не
// выносится (решение владельца 2026-07-16 — путало): выбор, совпавший с
// дефолтом роли, снимает переопределение автоматически, отличие помечается
// бейджем «изменено». Сохранение — сразу по клику через существующий
// updateUserPermsAction (полный набор полей cap_*); БД-страж дублирует проверки.
export function UserPermsToggles({
  userId,
  targetRole,
  current,
  actorRole,
  actorCaps,
  readOnly = false,
}: {
  userId: string;
  targetRole: Role;
  current: PermOverrides;
  actorRole: Role;
  actorCaps: EffectiveCaps;
  // Просмотр без правки (свой профиль / вне зоны управления / деактивирован):
  // показываем ВСЕ права с эффективными значениями, тумблеры заблокированы.
  readOnly?: boolean;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [overrides, setOverrides] = useState<PermOverrides>(current);
  const [pending, startTransition] = useTransition();

  const editable = useMemo(
    () =>
      new Set(
        CAPABILITIES.filter((cap) =>
          canGrantCapability(cap, actorRole, actorCaps, targetRole, false),
        ),
      ),
    [actorRole, actorCaps, targetRole],
  );

  if (!readOnly && editable.size === 0) {
    return (
      <p className="text-[13px] text-text-muted">{t.users.perms.noneEditable}</p>
    );
  }

  const changedCount = CAPABILITIES.filter((cap) => {
    const ov = overrides[cap];
    return typeof ov === 'boolean' && ov !== capRoleDefault(cap, targetRole);
  }).length;

  function submit(next: PermOverrides) {
    const fd = new FormData();
    fd.set('user_id', userId);
    for (const cap of CAPABILITIES) {
      if (!editable.has(cap)) continue;
      const ov = next[cap];
      fd.set(
        `cap_${cap}`,
        typeof ov === 'boolean' ? (ov ? 'grant' : 'revoke') : 'inherit',
      );
    }
    setOverrides(next);
    startTransition(async () => {
      await updateUserPermsAction(fd);
      router.refresh();
    });
  }

  function toggle(cap: Capability) {
    const effNext = !effectiveCap(cap, targetRole, overrides);
    const next: PermOverrides = { ...overrides };
    // Совпало с дефолтом роли → переопределение не нужно (inherit).
    if (effNext === capRoleDefault(cap, targetRole)) delete next[cap];
    else next[cap] = effNext;
    submit(next);
  }

  function resetAll() {
    const next: PermOverrides = { ...overrides };
    for (const cap of CAPABILITIES) if (editable.has(cap)) delete next[cap];
    submit(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="max-w-[52ch] text-[12.5px] text-text-muted">
          {fmt(t.users.card.permsIntro, { role: t.enums.role[targetRole] })}
        </p>
        {!readOnly && changedCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={pending}
          >
            <RotateCcw size={13} strokeWidth={1.75} />
            {pending ? t.users.card.permsResetting : t.users.card.permsResetAll}
          </Button>
        )}
      </div>

      {PERM_GROUPS.map((group) => {
        const caps = readOnly
          ? group.caps
          : group.caps.filter((cap) => editable.has(cap));
        if (caps.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-0.5">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-subtle">
              {t.users.card.permsGroups[group.key]}
            </h3>
            <div className="divide-y divide-border/60">
              {caps.map((cap) => {
                const allowed = effectiveCap(cap, targetRole, overrides);
                const ov = overrides[cap];
                const changed =
                  typeof ov === 'boolean' && ov !== capRoleDefault(cap, targetRole);
                const labelId = `perm-${userId}-${cap}`;
                return (
                  <div
                    key={cap}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        id={labelId}
                        className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text"
                      >
                        {t.enums.capabilityLabel[cap]}
                        <CapHelpButton cap={cap} />
                        {changed && (
                          <span className="rounded-full bg-primary-subtle px-2 py-px text-[10.5px] font-semibold text-primary-pressed">
                            {t.users.card.permsChanged}
                          </span>
                        )}
                      </span>
                      <p className="text-[12px] text-text-muted">
                        {t.enums.capabilityHint[cap]}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span
                        className={cn(
                          'min-w-[84px] text-right text-[12px] font-medium',
                          allowed ? 'text-success-text' : 'text-text-subtle',
                        )}
                      >
                        {allowed
                          ? t.users.card.permsAllowed
                          : t.users.card.permsDenied}
                      </span>
                      <Switch
                        checked={allowed}
                        onCheckedChange={() => toggle(cap)}
                        disabled={readOnly || pending || !editable.has(cap)}
                        aria-labelledby={labelId}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
