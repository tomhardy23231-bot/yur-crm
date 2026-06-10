import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Absence, AbsenceWithUser, AbsenceKind } from '@/lib/types/db';

const SELECT = 'id, user_id, kind, starts_on, ends_on, note, created_by, created_at';

function normalizeKind(k: string): AbsenceKind {
  return k === 'sick' || k === 'other' ? k : 'vacation';
}

// Отсутствия одного сотрудника (карточка) — новые сверху по дате начала.
// RLS (absence_user_visible) сам отдаёт пусто, если зритель не вправе их видеть.
export async function listAbsencesByUser(userId: string): Promise<Absence[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('absences')
    .select(SELECT)
    .eq('user_id', userId)
    .order('starts_on', { ascending: false });

  if (error) throw new Error(`listAbsencesByUser failed: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, kind: normalizeKind(r.kind) })) as Absence[];
}

// Отсутствия, пересекающие диапазон [from, to] (для общего календаря). Overlap:
// starts_on <= to AND ends_on >= from (обе границы включительно, даты YYYY-MM-DD).
// RLS скоупит выдачу по подразделению зрителя — чужие отпуска вне зоны не придут.
export async function listAbsencesInRange(params: {
  from: string; // YYYY-MM-DD включительно
  to: string;   // YYYY-MM-DD включительно
}): Promise<AbsenceWithUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('absences')
    .select(`${SELECT}, user:user_id(id, full_name)`)
    .lte('starts_on', params.to)
    .gte('ends_on', params.from)
    .order('starts_on', { ascending: true });

  if (error) throw new Error(`listAbsencesInRange failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const u = Array.isArray(r.user) ? (r.user[0] ?? null) : r.user;
    return { ...r, kind: normalizeKind(r.kind), user: u };
  }) as AbsenceWithUser[];
}
