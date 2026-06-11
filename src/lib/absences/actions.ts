'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { dbErrorMessage } from '@/lib/errors';
import { getT } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ABSENCE_KINDS, type AbsenceKind } from '@/lib/types/db';
import { canManageAbsencesOf } from './access';
import { UUID_RE, isValidDate } from '@/lib/validation';

// ============================================================================
// Создание отсутствия. RLS (absence_can_write): сам / owner / admin-подразделение.
// ============================================================================
export type CreateAbsenceFields = 'kind' | 'starts_on' | 'ends_on' | 'note';

export type CreateAbsenceState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<CreateAbsenceFields, string>>;
};

export async function createAbsenceAction(
  _prev: CreateAbsenceState,
  formData: FormData,
): Promise<CreateAbsenceState> {
  const user = await requireUser();
  const { t } = await getT();

  const user_id = String(formData.get('user_id') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim();
  const starts_on = String(formData.get('starts_on') ?? '').trim();
  const ends_on = String(formData.get('ends_on') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!user_id || !UUID_RE.test(user_id)) {
    return { ok: false, message: t.absences.actions.userInvalid };
  }

  const fieldErrors: CreateAbsenceState['fieldErrors'] = {};
  if (!(ABSENCE_KINDS as readonly string[]).includes(kind)) {
    fieldErrors.kind = t.absences.actions.kindInvalid;
  }
  if (!starts_on) fieldErrors.starts_on = t.absences.actions.dateRequired;
  else if (!isValidDate(starts_on)) fieldErrors.starts_on = t.absences.actions.dateInvalid;
  if (!ends_on) fieldErrors.ends_on = t.absences.actions.dateRequired;
  else if (!isValidDate(ends_on)) fieldErrors.ends_on = t.absences.actions.dateInvalid;
  if (
    starts_on && ends_on &&
    isValidDate(starts_on) && isValidDate(ends_on) &&
    ends_on < starts_on
  ) {
    fieldErrors.ends_on = t.absences.actions.rangeInvalid;
  }
  if (note.length > 500) fieldErrors.note = t.absences.actions.noteTooLong;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.absences.actions.checkForm };
  }

  const supabase = await createSupabaseServerClient();

  // Право (зеркало RLS absence_can_write): сам / owner / admin своего подразделения.
  // Дружелюбный ранний отказ; финальный страж — сама RLS на INSERT.
  const { data: target } = await supabase
    .from('users')
    .select('id, department_id')
    .eq('id', user_id)
    .maybeSingle<{ id: string; department_id: string | null }>();
  if (!target) {
    return { ok: false, message: t.absences.actions.userInvalid };
  }
  const canWrite = canManageAbsencesOf(
    {
      id: user.profile.id,
      role: user.profile.role,
      department_id: user.profile.department_id,
      visibility_scope: user.profile.visibility_scope,
    },
    { id: target.id, department_id: target.department_id },
  );
  if (!canWrite) {
    return { ok: false, message: t.absences.actions.noWritePermission };
  }

  const { error } = await supabase.from('absences').insert({
    user_id,
    kind: kind as AbsenceKind,
    starts_on,
    ends_on,
    note: note || null,
    created_by: user.profile.id,
  });

  if (error) {
    // v3 s2: пересечение периодов отсутствия — триггер absences_no_overlap (errcode 23P01).
    if (error.code === '23P01' || (error.message ?? '').toLowerCase().includes('overlap')) {
      return { ok: false, message: t.absences.overlapError };
    }
    return {
      ok: false,
      message: dbErrorMessage('createAbsenceAction', error, t.absences.actions.createFailed, t.errors.db),
    };
  }

  revalidatePath(`/reports/payroll/${user_id}`);
  revalidatePath('/calendar');
  return { ok: true };
}

// ============================================================================
// Удаление отсутствия. RLS (absences_delete): кто вправе писать ИЛИ автор записи.
// Bare-form action (void) по образцу deleteActAction: кнопка показывается только при
// canManage (зеркало RLS), а revalidatePath перезагружает список — если RLS всё же
// отфильтровал строку (no-op), запись остаётся видимой пользователю. Поэтому ошибку
// логируем на сервер и тихо выходим, без отдельного канала фидбэка.
// ============================================================================
export async function deleteAbsenceAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get('id') ?? '').trim();
  const user_id = String(formData.get('user_id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('absences').delete().eq('id', id);
  if (error) {
    console.error('deleteAbsenceAction failed:', error.message);
    return;
  }
  if (user_id && UUID_RE.test(user_id)) revalidatePath(`/reports/payroll/${user_id}`);
  revalidatePath('/calendar');
}
