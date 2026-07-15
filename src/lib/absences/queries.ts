import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { dateOnly, toDbDate, ts } from '@/lib/db/convert';
import type { Absence, AbsenceWithUser, AbsenceKind } from '@/lib/types/db';

function normalizeKind(k: string): AbsenceKind {
  return k === 'sick' || k === 'other' ? k : 'vacation';
}

type AbsenceRow = {
  id: string;
  user_id: string;
  kind: string;
  starts_on: Date;
  ends_on: Date;
  note: string | null;
  created_by: string;
  created_at: Date;
};

function toAbsence(r: AbsenceRow): Absence {
  return {
    id: r.id,
    user_id: r.user_id,
    kind: normalizeKind(r.kind),
    starts_on: dateOnly(r.starts_on),
    ends_on: dateOnly(r.ends_on),
    note: r.note,
    created_by: r.created_by,
    created_at: ts(r.created_at),
  };
}

const ABSENCE_SELECT = {
  id: true,
  user_id: true,
  kind: true,
  starts_on: true,
  ends_on: true,
  note: true,
  created_by: true,
  created_at: true,
} as const;

// Отсутствия одного сотрудника (карточка) — новые сверху по дате начала.
// RLS (absence_user_visible) сам отдаёт пусто, если зритель не вправе их видеть.
export async function listAbsencesByUser(userId: string): Promise<Absence[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.absences.findMany({
      where: { user_id: userId },
      orderBy: { starts_on: 'desc' },
      select: ABSENCE_SELECT,
    }),
  );
  return rows.map(toAbsence);
}

// Отсутствия, пересекающие диапазон [from, to] (для общего календаря). Overlap:
// starts_on <= to AND ends_on >= from (обе границы включительно, даты YYYY-MM-DD).
// RLS скоупит выдачу по подразделению зрителя — чужие отпуска вне зоны не придут.
export async function listAbsencesInRange(params: {
  from: string; // YYYY-MM-DD включительно
  to: string;   // YYYY-MM-DD включительно
}): Promise<AbsenceWithUser[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.absences.findMany({
      where: {
        starts_on: { lte: toDbDate(params.to) },
        ends_on: { gte: toDbDate(params.from) },
      },
      orderBy: { starts_on: 'asc' },
      select: {
        ...ABSENCE_SELECT,
        users_absences_user_idTousers: {
          select: { id: true, full_name: true },
        },
      },
    }),
  );

  return rows.map((r) => ({
    ...toAbsence(r),
    user: r.users_absences_user_idTousers
      ? {
          id: r.users_absences_user_idTousers.id,
          full_name: r.users_absences_user_idTousers.full_name,
        }
      : null,
  }));
}
