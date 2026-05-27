'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseMinutes } from './parse';

export type TimeEntryFields =
  | 'case_id'
  | 'task_id'
  | 'spent_at'
  | 'minutes'
  | 'billable'
  | 'hourly_rate'
  | 'note';

export type TimeEntryActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<TimeEntryFields, string>>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RATE = 1_000_000; // 1М грн/ч с запасом — больше дать невозможно по UX.

function getString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

type Validated = {
  case_id: string;
  task_id: string | null;
  spent_at: string;
  minutes: number;
  billable: boolean;
  hourly_rate: number | null;
  note: string | null;
};

function validate(formData: FormData):
  | { ok: true; data: Validated }
  | { ok: false; state: TimeEntryActionState } {
  const fieldErrors: TimeEntryActionState['fieldErrors'] = {};

  const case_id = getString(formData, 'case_id');
  const task_id_raw = getString(formData, 'task_id');
  const spent_at = getString(formData, 'spent_at');
  const minutes_raw = getString(formData, 'minutes');
  const billable_raw = getString(formData, 'billable');
  const rate_raw = getString(formData, 'hourly_rate');
  const note_raw = getString(formData, 'note');

  if (!case_id || !UUID_RE.test(case_id)) {
    fieldErrors.case_id = 'Не указано дело';
  }

  let task_id: string | null = null;
  if (task_id_raw) {
    if (!UUID_RE.test(task_id_raw)) {
      fieldErrors.task_id = 'Некорректный идентификатор задачи';
    } else {
      task_id = task_id_raw;
    }
  }

  if (!spent_at) {
    fieldErrors.spent_at = 'Укажите дату';
  } else if (!isValidDate(spent_at)) {
    fieldErrors.spent_at = 'Некорректная дата';
  }

  const minutes = parseMinutes(minutes_raw);
  if (minutes === null) {
    fieldErrors.minutes =
      'Формат: «1ч 30м», «1.5», «1:30» или «90м» (макс 24 ч)';
  }

  // hourly_rate optional. Пусто → null, иначе валидируем как число ≥ 0.
  let hourly_rate: number | null = null;
  if (rate_raw) {
    const normalized = rate_raw.replace(',', '.');
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0 || n >= MAX_RATE) {
      fieldErrors.hourly_rate = 'Ставка — число от 0';
    } else {
      hourly_rate = n;
    }
  }

  if (note_raw.length > 500) {
    fieldErrors.note = 'Слишком длинно (макс 500)';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: { ok: false, fieldErrors, message: 'Проверьте поля формы' },
    };
  }

  return {
    ok: true,
    data: {
      case_id,
      task_id,
      spent_at,
      minutes: minutes!,
      // checkbox: html-form шлёт 'on' если отмечен, иначе ключа в FormData нет
      // → getString возвращает ''. Default: billable=true (большинство часов
      // оплачиваемые), снимается явным uncheck'ом.
      billable: billable_raw !== 'false' && billable_raw !== 'off' ? true : false,
      hourly_rate,
      note: note_raw || null,
    },
  };
}

// =====================================================================
// createTimeEntryAction — INSERT.
// RLS: can_write_case(case_id) + user_id = active_uid.
// =====================================================================
export async function createTimeEntryAction(
  _prev: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  const user = await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from('time_entries')
    .insert({
      case_id: result.data.case_id,
      task_id: result.data.task_id,
      user_id: user.profile.id,
      spent_at: result.data.spent_at,
      minutes: result.data.minutes,
      billable: result.data.billable,
      hourly_rate: result.data.hourly_rate,
      note: result.data.note,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      message: `Не удалось сохранить запись: ${error?.message ?? 'unknown'}`,
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: result.data.case_id,
    action: 'time_entry_created',
    changes: {
      time_entry_id: inserted.id,
      minutes: result.data.minutes,
      spent_at: result.data.spent_at,
      billable: result.data.billable,
      hourly_rate: result.data.hourly_rate,
      task_id: result.data.task_id,
    },
  });

  revalidatePath(`/cases/${result.data.case_id}`);
  revalidatePath('/time');
  return { ok: true };
}

// =====================================================================
// updateTimeEntryAction — PATCH своих часов (или любых для staff).
// =====================================================================
export async function updateTimeEntryAction(
  entryId: string,
  _prev: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  await requireUser();
  if (!UUID_RE.test(entryId)) {
    return { ok: false, message: 'Некорректный идентификатор' };
  }
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();

  // Снапшот для diff.
  const { data: before } = await supabase
    .from('time_entries')
    .select('minutes, spent_at, billable, hourly_rate, task_id, note')
    .eq('id', entryId)
    .maybeSingle();

  const { error } = await supabase
    .from('time_entries')
    .update({
      spent_at: result.data.spent_at,
      minutes: result.data.minutes,
      billable: result.data.billable,
      hourly_rate: result.data.hourly_rate,
      task_id: result.data.task_id,
      note: result.data.note,
    })
    .eq('id', entryId);

  if (error) {
    return { ok: false, message: error.message };
  }

  if (before) {
    await logActivity({
      entity_type: 'case',
      entity_id: result.data.case_id,
      action: 'time_entry_updated',
      changes: {
        time_entry_id: entryId,
        before: {
          minutes: before.minutes,
          spent_at: before.spent_at,
          billable: before.billable,
          hourly_rate: before.hourly_rate,
        },
        after: {
          minutes: result.data.minutes,
          spent_at: result.data.spent_at,
          billable: result.data.billable,
          hourly_rate: result.data.hourly_rate,
        },
      },
    });
  }

  revalidatePath(`/cases/${result.data.case_id}`);
  revalidatePath('/time');
  return { ok: true };
}

// =====================================================================
// deleteTimeEntryAction — bare action (form).
// RLS DELETE = свои + is_staff; UI скрывает кнопку для чужих.
// requireRole здесь НЕ ставим — specialist должен удалять свои часы.
// CSO #2: case_id для лога берём из row, а не из user-supplied formData.
// =====================================================================
export async function deleteTimeEntryAction(formData: FormData): Promise<void> {
  // Specialist может удалять свои entries (по RLS), assistant тоже свои.
  // Намеренно НЕ требуем staff-role, в отличие от cases/payments/documents/clients.
  await requireUser();

  const entry_id = getString(formData, 'entry_id');
  if (!entry_id || !UUID_RE.test(entry_id)) return;

  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from('time_entries')
    .select('case_id, minutes, spent_at, user_id')
    .eq('id', entry_id)
    .maybeSingle();

  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', entry_id);

  if (error) {
    console.error('deleteTimeEntryAction failed:', error.message);
    return;
  }

  if (row?.case_id && UUID_RE.test(row.case_id)) {
    await logActivity({
      entity_type: 'case',
      entity_id: row.case_id,
      action: 'time_entry_deleted',
      changes: {
        time_entry_id: entry_id,
        minutes: row.minutes,
        spent_at: row.spent_at,
        user_id: row.user_id,
      },
    });
    revalidatePath(`/cases/${row.case_id}`);
    revalidatePath('/time');
  }
}
