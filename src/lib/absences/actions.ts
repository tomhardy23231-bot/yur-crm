'use server';

import { revalidatePath } from 'next/cache';

import { logActivity } from '@/lib/activity-log/log';
import { requireUser } from '@/lib/auth/require-role';
import { userDb } from '@/lib/db';
import { dbActionError, pgErrorCode, prismaErrorToDbError } from '@/lib/db/errors';
import { toDbDate } from '@/lib/db/convert';
import { getT } from '@/lib/i18n/server';
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

  // Право (зеркало RLS absence_can_write): сам / owner / admin своего подразделения.
  // Дружелюбный ранний отказ; финальный страж — сама RLS на INSERT.
  const target = await userDb(user.profile.id, (tx) =>
    tx.public_users.findUnique({
      where: { id: user_id },
      select: { id: true, department_id: true },
    }),
  );
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

  try {
    await userDb(user.profile.id, (tx) =>
      tx.absences.create({
        data: {
          user_id,
          kind: kind as AbsenceKind,
          starts_on: toDbDate(starts_on),
          ends_on: toDbDate(ends_on),
          note: note || null,
          created_by: user.profile.id,
        },
      }),
    );
  } catch (err) {
    // v3 s2: пересечение периодов отсутствия — триггер absences_no_overlap (errcode 23P01).
    const message = prismaErrorToDbError(err)?.message ?? '';
    if (pgErrorCode(err) === '23P01' || message.toLowerCase().includes('overlap')) {
      return { ok: false, message: t.absences.overlapError };
    }
    return {
      ok: false,
      message: dbActionError('createAbsenceAction', err, t.absences.actions.createFailed, t.errors.db),
    };
  }

  await logActivity({
    entity_type: 'absence',
    entity_id: user_id,
    action: 'absence_created',
    changes: { user_id, kind, starts_on, ends_on, note: note || null },
  });

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
  const user = await requireUser();
  const id = String(formData.get('id') ?? '').trim();
  const user_id = String(formData.get('user_id') ?? '').trim();
  if (!id || !UUID_RE.test(id)) return;

  // Детали строки — до удаления (для записи в журнал).
  let deleted: {
    user_id: string;
    kind: string;
    starts_on: string;
    ends_on: string;
  } | null = null;

  try {
    // Возврат из колбэка (не присваивание в замыкании) — иначе TS теряет тип.
    deleted = await userDb(user.profile.id, async (tx) => {
      const row = await tx.absences.findUnique({
        where: { id },
        select: { user_id: true, kind: true, starts_on: true, ends_on: true },
      });
      // deleteMany — тихий no-op под RLS (0 строк), не исключение невидимой строки.
      const res = await tx.absences.deleteMany({ where: { id } });
      if (res.count === 0 || !row) return null;
      return {
        user_id: row.user_id,
        kind: row.kind,
        starts_on: row.starts_on.toISOString().slice(0, 10),
        ends_on: row.ends_on.toISOString().slice(0, 10),
      };
    });
  } catch (err) {
    console.error('deleteAbsenceAction failed:', err);
    return;
  }

  if (deleted !== null) {
    await logActivity({
      entity_type: 'absence',
      entity_id: deleted.user_id,
      action: 'absence_deleted',
      changes: {
        user_id: deleted.user_id,
        kind: deleted.kind,
        starts_on: deleted.starts_on,
        ends_on: deleted.ends_on,
      },
    });
  }
  if (user_id && UUID_RE.test(user_id)) revalidatePath(`/reports/payroll/${user_id}`);
  revalidatePath('/calendar');
}
