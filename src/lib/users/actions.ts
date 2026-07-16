'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { getT } from '@/lib/i18n/server';
import { userDb } from '@/lib/db';
import { adminDb } from '@/lib/db/admin';
import { rpcManageUserSalaries, rpcSetUserLoginSecret } from '@/lib/db/rpc';
import { Prisma } from '@/generated/prisma/client';
import { generateTempPassword } from '@/lib/users/temp-password';
import { UUID_RE } from '@/lib/validation';
import {
  canCreateTargetUser,
  canManageTargetUser,
  canGrantCapability,
  isRole,
  isSalaryMode,
  isVisibilityScope,
  CAPABILITIES,
  type Role,
  type PermOverrides,
  type SalaryMode,
  type VisibilityScope,
} from '@/lib/types/db';

// Считывает переопределения прав из формы (поля cap_<key> ∈ inherit|grant|revoke).
// Применяет только те права, что актор ВПРАВЕ выдать целевой роли
// (canGrantCapability) — анти-эскалация в коде (на пути service_role БД-триггер
// guard не срабатывает, поэтому проверка здесь — единственный страж создания).
// base — исходные оверрайды (для update сохраняем неуправляемые ключи как есть).
function collectPermOverrides(
  formData: FormData,
  actorRole: Role,
  actorCaps: Parameters<typeof canGrantCapability>[2],
  targetRole: Role,
  base: PermOverrides = {},
): PermOverrides {
  const next: PermOverrides = { ...base };
  for (const cap of CAPABILITIES) {
    if (!canGrantCapability(cap, actorRole, actorCaps, targetRole, false)) {
      continue; // не вправе менять — оставляем как было (для update) / не задаём (create)
    }
    const raw = String(formData.get(`cap_${cap}`) ?? 'inherit');
    if (raw === 'grant') next[cap] = true;
    else if (raw === 'revoke') next[cap] = false;
    else delete next[cap]; // inherit → удаляем ключ
  }
  return next;
}

// perm_overrides в Prisma — Json; нормализуем в объект PermOverrides (как current-user).
function normalizeOverrides(v: unknown): PermOverrides {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as PermOverrides)
    : {};
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ступенчатые права (Задача 4 «плюшка владельца») — общий помощник canManageRole
// дублирует private.can_manage_target_user в БД (RLS). В коде он тоже обязателен:
// создание auth-пользователя идёт через service_role в обход RLS, поэтому на том
// пути проверка прав — только здесь.

// Разовый временный пароль — общий генератор (lib/users/temp-password).

// ============================================================================
// Создание пользователя (useActionState-форма).
// auth-пользователь + строка public.users создаются через service_role на
// сервере (тот же путь, что в scripts/seed.ts). На клиент service_role не уходит.
// ============================================================================

export type CreateUserFields = 'full_name' | 'email' | 'role';

export type CreateUserState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreateUserFields, string>>;
  // Разовый пароль и email показываем создателю один раз после успеха.
  tempPassword?: string;
  createdEmail?: string;
};

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requireUser();
  const { t, fmt } = await getT();
  // Сплит 2026-07-16: создание — отдельное право create_users (роли и права
  // остаются под manage_users).
  if (!actor.caps.create_users) {
    return { ok: false, message: t.users.errors.noCreateUsers };
  }

  const full_name = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role_raw = String(formData.get('role') ?? '').trim();

  const fieldErrors: CreateUserState['fieldErrors'] = {};
  if (!full_name) fieldErrors.full_name = t.users.errors.enterName;
  else if (full_name.length > 120) fieldErrors.full_name = t.users.errors.nameTooLong;

  if (!email) fieldErrors.email = t.users.errors.enterEmail;
  else if (!EMAIL_RE.test(email) || email.length > 200)
    fieldErrors.email = t.users.errors.invalidEmail;

  if (!role_raw) fieldErrors.role = t.users.errors.selectRole;
  else if (!isRole(role_raw)) fieldErrors.role = t.users.errors.invalidRole;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  const role = role_raw as Role;

  // Ступенчатые права: owner — любой; иной обладатель create_users — не owner/admin.
  if (!canCreateTargetUser(actor.profile.role, actor.caps.create_users, role)) {
    return {
      ok: false,
      message: fmt(t.users.errors.noPermsForRole, { role: t.enums.role[role] }),
    };
  }

  // Персональные права при создании (опционально). Создание идёт через
  // service_role в обход RLS и БД-триггера guard, поэтому анти-эскалацию по
  // каждому праву проверяет collectPermOverrides (canGrantCapability) здесь.
  const permOverrides = collectPermOverrides(
    formData,
    actor.profile.role,
    actor.caps,
    role,
  );

  // v2 Этап 3: подразделение/должность/скоуп при создании. Создание идёт через
  // service_role (auth.uid() null → БД-гард users_guard_visibility_fields
  // пропускает), поэтому owner-only для department_id/visibility_scope
  // ENFORCE здесь. position — любой обладатель manage_users.
  const isOwnerActor = actor.profile.role === 'owner';
  const positionRaw = String(formData.get('position') ?? '').trim();
  const position = positionRaw === '' ? null : positionRaw.slice(0, 120);
  let department_id: string | null = null;
  let visibility_scope: VisibilityScope = 'department';
  if (isOwnerActor) {
    const deptRaw = String(formData.get('department_id') ?? '').trim();
    department_id = deptRaw !== '' && UUID_RE.test(deptRaw) ? deptRaw : null;
    const scopeRaw = String(formData.get('visibility_scope') ?? '').trim();
    if (isVisibilityScope(scopeRaw)) visibility_scope = scopeRaw;
  }

  // Цикл v4: учётка входа (auth.users, bcrypt-хеш) и профиль (public.users)
  // создаются ОДНОЙ транзакцией admin-пула — осиротевшие auth-строки
  // исключены по построению (прежний двухшаговый путь GoTrue компенсировал
  // это ручным deleteUser).
  const password = generateTempPassword();
  const newId = randomUUID();
  try {
    const db = adminDb();
    const hash = await bcrypt.hash(password, 10);
    await db.$transaction([
      db.auth_users.create({
        data: { id: newId, email, encrypted_password: hash },
      }),
      db.public_users.create({
        data: {
          id: newId,
          full_name,
          email,
          role,
          is_active: true,
          perm_overrides: permOverrides as Prisma.InputJsonValue,
          department_id,
          position,
          visibility_scope,
        },
      }),
    ]);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === 'P2002' ||
        (err.code === 'P2010' &&
          String((err.meta as { code?: unknown } | undefined)?.code) === '23505'))
    ) {
      return { ok: false, fieldErrors: { email: t.users.errors.emailExists } };
    }
    console.error('[createUserAction]', err);
    return { ok: false, message: t.users.errors.createFailed };
  }

  // Лог под сессией актора (private.active_uid = он). entity_type='user'.
  await logActivity({
    entity_type: 'user',
    entity_id: newId,
    action: 'user_created',
    changes: { full_name, email, role },
  });

  // Если при создании заданы персональные права — отдельная запись в журнал.
  if (Object.keys(permOverrides).length > 0) {
    await logActivity({
      entity_type: 'user',
      entity_id: newId,
      action: 'user_permissions_changed',
      changes: { before: {}, after: permOverrides },
    });
  }

  // Зеркало пароля для модалки «Доступ» (владелец видит выданный пароль позже).
  // Только когда создаёт owner: set_user_login_secret — owner-gated DEFINER.
  if (actor.profile.role === 'owner') {
    try {
      await userDb(actor.profile.id, (tx) =>
        rpcSetUserLoginSecret(tx, { userId: newId, password }),
      );
    } catch (err) {
      console.error('[createUserAction.mirror]', err);
    }
  }

  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  return {
    ok: true,
    createdEmail: email,
    tempPassword: password,
    message: t.users.create.successTitle,
  };
}

// ============================================================================
// Изменение персональных прав пользователя (bare action, форма-кнопка «Сохранить»).
// Право manage_users у актора; ступенчатые права + анти-эскалация per-cap
// дублируются в БД (private.can_grant_cap + триггер users_perm_overrides_2_guard).
// ============================================================================

export async function updateUserPermsAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_users) return;

  const user_id = String(formData.get('user_id') ?? '').trim();
  if (!UUID_RE.test(user_id)) return;
  // Нельзя редактировать собственные права (как в БД-страже can_grant_cap).
  if (user_id === actor.profile.id) return;

  let changed: { before: PermOverrides; next: PermOverrides } | null = null;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const target = await tx.public_users.findUnique({
        where: { id: user_id },
        select: { role: true, is_active: true, perm_overrides: true },
      });
      // нет записи / деактивированному права не правим — сначала реактивировать.
      if (!target || !target.is_active) return null;
      const targetRole = target.role as Role;
      if (
        !canManageTargetUser(actor.profile.role, actor.caps.manage_users, targetRole)
      ) {
        return null;
      }

      const before = normalizeOverrides(target.perm_overrides);
      const next = collectPermOverrides(
        formData,
        actor.profile.role,
        actor.caps,
        targetRole,
        before,
      );
      if (JSON.stringify(before) === JSON.stringify(next)) return null; // no-op

      // RLS users_update_managed_roles + триггер guard дублируют проверку в БД.
      const upd = await tx.public_users.updateMany({
        where: { id: user_id },
        data: { perm_overrides: next as Prisma.InputJsonValue },
      });
      return upd.count > 0 ? { before, next } : null;
    });
  } catch (err) {
    console.error('updateUserPermsAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: 'user_permissions_changed',
    changes: { before: changed.before, after: changed.next },
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
}

// ============================================================================
// Смена роли (bare action, форма-селект).
// ============================================================================

export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_users) return;
  const user_id = String(formData.get('user_id') ?? '').trim();
  const role_raw = String(formData.get('role') ?? '').trim();
  if (!UUID_RE.test(user_id) || !isRole(role_raw)) return;
  const newRole = role_raw as Role;

  // Нельзя менять собственную роль (защита от самопонижения/самоблокировки owner).
  if (user_id === actor.profile.id) return;

  let fromRole: Role | null = null;
  try {
    fromRole = await userDb(actor.profile.id, async (tx) => {
      const target = await tx.public_users.findUnique({
        where: { id: user_id },
        select: { role: true, is_active: true },
      });
      // Задача 9b: у деактивированного роль не меняем — сначала реактивировать.
      if (!target || !target.is_active) return null;
      const targetRole = target.role as Role;
      if (targetRole === newRole) return null; // no-op

      // Ступенчатые права: и текущая, и новая роль — в зоне ответственности актора.
      // (не-owner не трогает owner/admin и не повышает до них.) Смена роли сбрасывает
      // персональные права цели — это делает БД-триггер reset_perm_overrides_on_role_change.
      if (
        !canManageTargetUser(actor.profile.role, actor.caps.manage_users, targetRole) ||
        !canManageTargetUser(actor.profile.role, actor.caps.manage_users, newRole)
      ) {
        return null;
      }

      // RLS users_update_managed_roles дублирует проверку на уровне БД.
      const upd = await tx.public_users.updateMany({
        where: { id: user_id },
        data: { role: newRole },
      });
      return upd.count > 0 ? targetRole : null;
    });
  } catch (err) {
    console.error('changeUserRoleAction failed:', err);
    return;
  }
  if (!fromRole) return;

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: 'user_role_changed',
    changes: { from: fromRole, to: newRole },
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
}

// ============================================================================
// Деактивация / реактивация (bare action, форма-кнопка).
// Данные не удаляем — помечаем is_active. Деактивированный теряет доступ
// автоматически: private.active_uid() и getCurrentUser() возвращают null для
// is_active=false на каждом запросе, RLS отрезает данные. Историч. записи и
// выплаты сохраняются.
// ============================================================================

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_users) return;
  const user_id = String(formData.get('user_id') ?? '').trim();
  const active_raw = String(formData.get('active') ?? '').trim();
  if (!UUID_RE.test(user_id) || (active_raw !== 'true' && active_raw !== 'false')) {
    return;
  }
  const nextActive = active_raw === 'true';

  // Нельзя деактивировать самого себя.
  if (user_id === actor.profile.id) return;

  let changed = false;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const target = await tx.public_users.findUnique({
        where: { id: user_id },
        select: { role: true, is_active: true },
      });
      if (!target || target.is_active === nextActive) return false; // нет / no-op

      // Ступенчатые права: не-owner не может (де)активировать owner/admin.
      if (
        !canManageTargetUser(
          actor.profile.role,
          actor.caps.manage_users,
          target.role as Role,
        )
      ) {
        return false;
      }

      // RLS users_update_managed_roles дублирует проверку на уровне БД.
      const upd = await tx.public_users.updateMany({
        where: { id: user_id },
        data: { is_active: nextActive },
      });
      return upd.count > 0;
    });
  } catch (err) {
    console.error('setUserActiveAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: nextActive ? 'user_reactivated' : 'user_deactivated',
    changes: { is_active: nextActive },
  });
  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
}

// ============================================================================
// Назначение подразделения / должности / скоупа видимости (v2 Этап 3).
// department_id и visibility_scope меняет ТОЛЬКО owner (спека + БД-гард
// users_guard_visibility_fields дублирует на пути сессии). position —
// любой обладатель manage_users в зоне управления (как роль/права).
// Деактивированному не правим (сначала реактивировать).
// ============================================================================

export async function assignUserDepartmentAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_users) return;

  const user_id = String(formData.get('user_id') ?? '').trim();
  if (!UUID_RE.test(user_id)) return;

  const isOwnerActor = actor.profile.role === 'owner';

  let result:
    | {
        touchedVisibility: boolean;
        before: { department_id: string | null; visibility_scope: VisibilityScope };
        after: { department_id: string | null; visibility_scope: VisibilityScope };
      }
    | null = null;
  try {
    result = await userDb(actor.profile.id, async (tx) => {
      const target = await tx.public_users.findUnique({
        where: { id: user_id },
        select: {
          role: true,
          is_active: true,
          department_id: true,
          position: true,
          visibility_scope: true,
        },
      });
      if (!target || !target.is_active) return null;
      if (
        !canManageTargetUser(actor.profile.role, actor.caps.manage_users, target.role as Role)
      ) {
        return null;
      }
      const targetScope: VisibilityScope =
        target.visibility_scope === 'all' ? 'all' : 'department';

      const update: {
        position?: string | null;
        department_id?: string | null;
        visibility_scope?: VisibilityScope;
      } = {};

      // position — любой обладатель manage_users.
      const positionRaw = String(formData.get('position') ?? '').trim();
      const nextPosition = positionRaw === '' ? null : positionRaw.slice(0, 120);
      if (nextPosition !== (target.position ?? null)) update.position = nextPosition;

      // department_id / visibility_scope — только owner.
      if (isOwnerActor) {
        const deptRaw = String(formData.get('department_id') ?? '').trim();
        const nextDept =
          deptRaw === '' ? null : UUID_RE.test(deptRaw) ? deptRaw : target.department_id;
        if (nextDept !== target.department_id) update.department_id = nextDept;

        const scopeRaw = String(formData.get('visibility_scope') ?? '').trim();
        const nextScope = isVisibilityScope(scopeRaw) ? scopeRaw : targetScope;
        if (nextScope !== targetScope) update.visibility_scope = nextScope;
      }

      if (Object.keys(update).length === 0) return null; // no-op

      // RLS users_update_managed_roles + гард users_guard_visibility_fields дублируют.
      const upd = await tx.public_users.updateMany({ where: { id: user_id }, data: update });
      if (upd.count === 0) return null;

      return {
        touchedVisibility: 'department_id' in update || 'visibility_scope' in update,
        before: { department_id: target.department_id, visibility_scope: targetScope },
        after: {
          department_id:
            'department_id' in update ? (update.department_id ?? null) : target.department_id,
          visibility_scope:
            'visibility_scope' in update ? update.visibility_scope! : targetScope,
        },
      };
    });
  } catch (err) {
    console.error('assignUserDepartmentAction failed:', err);
    return;
  }
  if (!result) return;

  // Журналим смену подразделения/scope (аудит видимости). position — косметика,
  // в журнал не пишем (как и БД-гард его не охраняет).
  if (result.touchedVisibility) {
    await logActivity({
      entity_type: 'user',
      entity_id: user_id,
      action: 'user_department_changed',
      changes: { before: result.before, after: result.after },
    });
  }

  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  revalidatePath('/settings/departments');
}

// ============================================================================
// Режим зарплаты и оклад (v2 Этап 4, bare action — форма редактора).
// Менять может owner (любому) либо обладатель manage_users (admin) — сотруднику
// СВОЕГО подразделения, не себе и только управляемых ролей. Дублируется БД-гардом
// users_guard_salary_fields + private.can_manage_user_salary (зеркало can_edit).
// Колонки salary_* защищены column-level привилегиями: before-state читаем через
// SECURITY DEFINER-RPC manage_user_salaries, а не прямым select.
// ============================================================================

export async function updateUserSalaryAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!actor.caps.manage_users) return;

  const user_id = String(formData.get('user_id') ?? '').trim();
  if (!UUID_RE.test(user_id)) return;

  const modeRaw = String(formData.get('salary_mode') ?? '').trim();
  if (!isSalaryMode(modeRaw)) return;
  const mode: SalaryMode = modeRaw;

  // Оклад: percent → null; fixed/fixed_percent → число ≥ 0 (до 2 знаков).
  let amount: number | null = null;
  if (mode !== 'percent') {
    const amountRaw = String(formData.get('salary_fixed_amount') ?? '')
      .trim()
      .replace(',', '.');
    const parsed = Number(amountRaw);
    if (amountRaw === '' || !Number.isFinite(parsed) || parsed < 0) return;
    amount = Math.round(parsed * 100) / 100;
  }

  let before: { salary_mode: SalaryMode; amount: number | null } | null = null;
  try {
    before = await userDb(actor.profile.id, async (tx) => {
      // before-state и право — через DEFINER-RPC (salary_* недоступны прямым select).
      const salaries = await rpcManageUserSalaries(tx);
      const row = salaries.find((s) => s.user_id === user_id);
      if (!row || !row.can_edit) return null; // не виден / нет права (зеркало гарда)

      const beforeAmount = row.salary_fixed_amount;
      if (row.salary_mode === mode && beforeAmount === amount) return null; // no-op

      // salary_* — @ignore в Prisma (column-level privacy): пишем сырым UPDATE
      // (UPDATE выдан на уровне таблицы, SELECT на этих колонках закрыт).
      // RLS users_update_managed_roles + гард users_guard_salary_fields дублируют.
      await tx.$executeRaw`
        update public.users
        set salary_mode = ${mode}, salary_fixed_amount = ${amount}::numeric
        where id = ${user_id}::uuid`;
      return { salary_mode: row.salary_mode as SalaryMode, amount: beforeAmount };
    });
  } catch (err) {
    console.error('updateUserSalaryAction failed:', err);
    return;
  }
  if (!before) return;

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: 'user_salary_changed',
    changes: {
      before: { salary_mode: before.salary_mode, salary_fixed_amount: before.amount },
      after: { salary_mode: mode, salary_fixed_amount: amount },
    },
  });

  revalidatePath('/settings/users');
  revalidatePath('/settings/users/[userId]', 'page');
  revalidatePath(`/reports/payroll/${user_id}`);
}
