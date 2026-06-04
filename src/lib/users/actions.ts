'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  canManageTargetUser,
  canGrantCapability,
  isRole,
  CAPABILITIES,
  type Role,
  type PermOverrides,
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ступенчатые права (Задача 4 «плюшка владельца») — общий помощник canManageRole
// дублирует private.can_manage_target_user в БД (RLS). В коде он тоже обязателен:
// создание auth-пользователя идёт через service_role в обход RLS, поэтому на том
// пути проверка прав — только здесь.

// Разовый временный пароль для нового сотрудника (меняет при первом входе).
function generateTempPassword(): string {
  return `Yur-${crypto.randomUUID()}`;
}

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
  if (!actor.caps.manage_users) {
    return { ok: false, message: t.users.errors.noManageUsers };
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

  // Ступенчатые права: owner — любой; иной обладатель manage_users — не owner/admin.
  if (!canManageTargetUser(actor.profile.role, actor.caps.manage_users, role)) {
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

  const admin = createSupabaseAdminClient();
  const password = generateTempPassword();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created?.user) {
    const msg = authErr?.message ?? '';
    if (/already|exist|registered/i.test(msg)) {
      return { ok: false, fieldErrors: { email: t.users.errors.emailExists } };
    }
    console.error('[createUserAction.auth]', msg);
    return { ok: false, message: t.users.errors.createFailed };
  }

  const newId = created.user.id;
  const { error: profErr } = await admin.from('users').insert({
    id: newId,
    full_name,
    email,
    role,
    is_active: true,
    perm_overrides: permOverrides,
  });
  if (profErr) {
    // Профиль не записался — удаляем осиротевшего auth-пользователя, чтобы
    // повторная попытка по тому же email не упёрлась в «уже существует».
    try {
      await admin.auth.admin.deleteUser(newId);
    } catch {
      // best-effort
    }
    return {
      ok: false,
      message: dbErrorMessage(
        'createUserAction.profile',
        profErr,
        t.users.errors.saveProfileFailed,
        t.errors.db,
      ),
    };
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

  revalidatePath('/settings/users');
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

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from('users')
    .select('id, role, is_active, perm_overrides')
    .eq('id', user_id)
    .maybeSingle<{
      id: string;
      role: Role;
      is_active: boolean;
      perm_overrides: PermOverrides | null;
    }>();
  if (!target) return;
  // Деактивированному права не правим — сначала реактивировать.
  if (!target.is_active) return;
  if (!canManageTargetUser(actor.profile.role, actor.caps.manage_users, target.role)) {
    return;
  }

  const before: PermOverrides = target.perm_overrides ?? {};
  const next = collectPermOverrides(
    formData,
    actor.profile.role,
    actor.caps,
    target.role,
    before,
  );

  if (JSON.stringify(before) === JSON.stringify(next)) return; // no-op

  // RLS users_update_managed_roles + триггер guard дублируют проверку в БД.
  const { error } = await supabase
    .from('users')
    .update({ perm_overrides: next })
    .eq('id', user_id);
  if (error) {
    console.error('updateUserPermsAction failed:', error.message);
    return;
  }

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: 'user_permissions_changed',
    changes: { before, after: next },
  });
  revalidatePath('/settings/users');
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

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from('users')
    .select('id, role, is_active')
    .eq('id', user_id)
    .maybeSingle<{ id: string; role: Role; is_active: boolean }>();
  if (!target) return;
  // Задача 9b: у деактивированного роль не меняем — сначала реактивировать.
  if (!target.is_active) return;
  if (target.role === newRole) return; // no-op

  // Ступенчатые права: и текущая, и новая роль — в зоне ответственности актора.
  // (не-owner не трогает owner/admin и не повышает до них.) Смена роли сбрасывает
  // персональные права цели — это делает БД-триггер reset_perm_overrides_on_role_change.
  if (
    !canManageTargetUser(actor.profile.role, actor.caps.manage_users, target.role) ||
    !canManageTargetUser(actor.profile.role, actor.caps.manage_users, newRole)
  ) {
    return;
  }

  // RLS users_update_managed_roles дублирует проверку на уровне БД.
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', user_id);
  if (error) {
    console.error('changeUserRoleAction failed:', error.message);
    return;
  }

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: 'user_role_changed',
    changes: { from: target.role, to: newRole },
  });
  revalidatePath('/settings/users');
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

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from('users')
    .select('id, role, is_active')
    .eq('id', user_id)
    .maybeSingle<{ id: string; role: Role; is_active: boolean }>();
  if (!target) return;
  if (target.is_active === nextActive) return; // no-op

  // Ступенчатые права: не-owner не может (де)активировать owner/admin.
  if (!canManageTargetUser(actor.profile.role, actor.caps.manage_users, target.role)) {
    return;
  }

  // RLS users_update_managed_roles дублирует проверку на уровне БД.
  const { error } = await supabase
    .from('users')
    .update({ is_active: nextActive })
    .eq('id', user_id);
  if (error) {
    console.error('setUserActiveAction failed:', error.message);
    return;
  }

  await logActivity({
    entity_type: 'user',
    entity_id: user_id,
    action: nextActive ? 'user_reactivated' : 'user_deactivated',
    changes: { is_active: nextActive },
  });
  revalidatePath('/settings/users');
}
