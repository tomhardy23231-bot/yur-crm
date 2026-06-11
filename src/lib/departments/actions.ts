'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/validation';

// Управление структурой компании — только owner (RLS departments_write_owner
// дублирует на стороне БД; здесь — ранний понятный отказ + журнал).
// Все операции идут под сессией пользователя (RLS работает); service_role НЕ нужен.

// ============================================================================
// Создание подразделения (useActionState-форма).
// ============================================================================

export type DepartmentFormState = {
  ok: boolean;
  message?: string;
  fieldError?: string;
};

export async function createDepartmentAction(
  _prev: DepartmentFormState,
  formData: FormData,
): Promise<DepartmentFormState> {
  const actor = await requireUser();
  const { t } = await getT();
  if (actor.profile.role !== 'owner') {
    return { ok: false, message: t.errors.db.noPermission };
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, fieldError: t.departments.errors.enterName };
  if (name.length > 100)
    return { ok: false, fieldError: t.departments.errors.nameTooLong };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('departments')
    .insert({ name })
    .select('id')
    .single<{ id: string }>();
  if (error) {
    return {
      ok: false,
      fieldError:
        error.code === '23505' ? t.departments.errors.nameTaken : undefined,
      message:
        error.code === '23505'
          ? undefined
          : dbErrorMessage('createDepartmentAction', error, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'department',
    entity_id: data.id,
    action: 'department_created',
    changes: { name },
  });

  revalidatePath('/settings/departments');
  return { ok: true, message: t.departments.created };
}

// ============================================================================
// Переименование подразделения (bare action, inline-форма).
// ============================================================================

export async function renameDepartmentAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (actor.profile.role !== 'owner') return;

  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!UUID_RE.test(id) || !name || name.length > 100) return;

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('departments')
    .select('name')
    .eq('id', id)
    .maybeSingle<{ name: string }>();
  if (!before || before.name === name) return; // нет записи / no-op

  const { error } = await supabase
    .from('departments')
    .update({ name })
    .eq('id', id);
  if (error) {
    console.error('renameDepartmentAction failed:', error.code, error.message);
    return;
  }

  await logActivity({
    entity_type: 'department',
    entity_id: id,
    action: 'department_renamed',
    changes: { from: before.name, to: name },
  });
  revalidatePath('/settings/departments');
}

// ============================================================================
// Деактивация / реактивация подразделения (bare action, кнопка).
// Деактивированное подразделение скрыто из селектов назначения/фильтров, но
// людей не открепляет и данные не трогает — только is_active.
// ============================================================================

export async function setDepartmentActiveAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (actor.profile.role !== 'owner') return;

  const id = String(formData.get('id') ?? '').trim();
  const active_raw = String(formData.get('active') ?? '').trim();
  if (!UUID_RE.test(id) || (active_raw !== 'true' && active_raw !== 'false')) return;
  const nextActive = active_raw === 'true';

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from('departments')
    .select('is_active')
    .eq('id', id)
    .maybeSingle<{ is_active: boolean }>();
  if (!before || before.is_active === nextActive) return; // нет записи / no-op

  const { error } = await supabase
    .from('departments')
    .update({ is_active: nextActive })
    .eq('id', id);
  if (error) {
    console.error('setDepartmentActiveAction failed:', error.code, error.message);
    return;
  }

  await logActivity({
    entity_type: 'department',
    entity_id: id,
    action: nextActive ? 'department_activated' : 'department_deactivated',
    changes: { is_active: nextActive },
  });
  revalidatePath('/settings/departments');
}
