'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { dbErrorMessage } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ROLE_LABEL, canManageRole, isRole, type Role } from '@/lib/types/db';

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
  const actor = await requireRole(['owner', 'admin']);

  const full_name = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role_raw = String(formData.get('role') ?? '').trim();

  const fieldErrors: CreateUserState['fieldErrors'] = {};
  if (!full_name) fieldErrors.full_name = 'Укажите имя';
  else if (full_name.length > 120) fieldErrors.full_name = 'Слишком длинно (макс 120)';

  if (!email) fieldErrors.email = 'Укажите email';
  else if (!EMAIL_RE.test(email) || email.length > 200)
    fieldErrors.email = 'Некорректный email';

  if (!role_raw) fieldErrors.role = 'Выберите роль';
  else if (!isRole(role_raw)) fieldErrors.role = 'Некорректная роль';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: 'Проверьте поля формы' };
  }

  const role = role_raw as Role;

  // Ступенчатые права: admin не может создать owner/admin.
  if (!canManageRole(actor.profile.role, role)) {
    return {
      ok: false,
      message: `Недостаточно прав для создания роли «${ROLE_LABEL[role]}».`,
    };
  }

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
      return { ok: false, fieldErrors: { email: 'Пользователь с таким email уже есть' } };
    }
    console.error('[createUserAction.auth]', msg);
    return { ok: false, message: 'Не удалось создать пользователя. Попробуйте ещё раз.' };
  }

  const newId = created.user.id;
  const { error: profErr } = await admin.from('users').insert({
    id: newId,
    full_name,
    email,
    role,
    is_active: true,
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
        'Не удалось сохранить профиль пользователя.',
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

  revalidatePath('/settings/users');
  return {
    ok: true,
    createdEmail: email,
    tempPassword: password,
    message: 'Пользователь создан.',
  };
}

// ============================================================================
// Смена роли (bare action, форма-селект).
// ============================================================================

export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireRole(['owner', 'admin']);
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
  // (admin не трогает owner/admin и не повышает до них.)
  if (
    !canManageRole(actor.profile.role, target.role) ||
    !canManageRole(actor.profile.role, newRole)
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
  const actor = await requireRole(['owner', 'admin']);
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

  // Ступенчатые права: admin не может (де)активировать owner/admin.
  if (!canManageRole(actor.profile.role, target.role)) return;

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
