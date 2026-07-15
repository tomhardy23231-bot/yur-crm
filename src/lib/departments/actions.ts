'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { userDb } from '@/lib/db';
import { dbActionError, pgErrorCode } from '@/lib/db/errors';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';

// Управление структурой компании — только owner (RLS departments_write_owner
// дублирует на стороне БД; здесь — ранний понятный отказ + журнал).
// Все операции идут под сессией пользователя (RLS работает); adminDb НЕ нужен.

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

  let newId: string;
  try {
    const dep = await userDb(actor.profile.id, (tx) =>
      tx.departments.create({ data: { name }, select: { id: true } }),
    );
    newId = dep.id;
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: false, fieldError: t.departments.errors.nameTaken };
    }
    return {
      ok: false,
      message: dbActionError('createDepartmentAction', err, undefined, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'department',
    entity_id: newId,
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

  let beforeName: string | null = null;
  try {
    beforeName = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.departments.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!before || before.name === name) return null; // нет записи / no-op
      const upd = await tx.departments.updateMany({ where: { id }, data: { name } });
      return upd.count > 0 ? before.name : null;
    });
  } catch (err) {
    console.error('renameDepartmentAction failed:', err);
    return;
  }
  if (beforeName === null) return;

  await logActivity({
    entity_type: 'department',
    entity_id: id,
    action: 'department_renamed',
    changes: { from: beforeName, to: name },
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

  let changed = false;
  try {
    changed = await userDb(actor.profile.id, async (tx) => {
      const before = await tx.departments.findUnique({
        where: { id },
        select: { is_active: true },
      });
      if (!before || before.is_active === nextActive) return false; // нет записи / no-op
      const upd = await tx.departments.updateMany({
        where: { id },
        data: { is_active: nextActive },
      });
      return upd.count > 0;
    });
  } catch (err) {
    console.error('setDepartmentActiveAction failed:', err);
    return;
  }
  if (!changed) return;

  await logActivity({
    entity_type: 'department',
    entity_id: id,
    action: nextActive ? 'department_activated' : 'department_deactivated',
    changes: { is_active: nextActive },
  });
  revalidatePath('/settings/departments');
}
