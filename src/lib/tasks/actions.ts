'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  TASK_KINDS,
  TASK_STATUSES,
  type TaskKind,
  type TaskStatus,
} from '@/lib/types/db';

export type TaskFormFields =
  | 'case_id'
  | 'title'
  | 'description'
  | 'kind'
  | 'assignee_id'
  | 'due_at';

export type TaskActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<TaskFormFields, string>>;
  values?: Partial<Record<TaskFormFields, string>>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isTaskKind(v: string): v is TaskKind {
  return (TASK_KINDS as readonly string[]).includes(v);
}
function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

// "2026-05-27T14:30" (datetime-local) → ISO timestamptz. Без TZ — берём локальную.
function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type Validated = {
  case_id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  assignee_id: string;
  due_at: string | null;
};

function validate(formData: FormData):
  | { ok: true; data: Validated; values: Record<TaskFormFields, string> }
  | { ok: false; state: TaskActionState } {
  const case_id = getString(formData, 'case_id');
  const title = getString(formData, 'title');
  const description = getString(formData, 'description');
  const kind_raw = getString(formData, 'kind');
  const assignee_id = getString(formData, 'assignee_id');
  const due_at_local = getString(formData, 'due_at');

  const values: Record<TaskFormFields, string> = {
    case_id,
    title,
    description,
    kind: kind_raw,
    assignee_id,
    due_at: due_at_local,
  };

  const fieldErrors: TaskActionState['fieldErrors'] = {};

  if (!case_id) fieldErrors.case_id = 'Выберите дело';
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = 'Некорректный идентификатор дела';

  if (!title) fieldErrors.title = 'Укажите название';
  else if (title.length > 200)
    fieldErrors.title = 'Слишком длинное (макс 200)';

  if (!kind_raw) fieldErrors.kind = 'Выберите тип';
  else if (!isTaskKind(kind_raw)) fieldErrors.kind = 'Недопустимый тип';

  if (!assignee_id) fieldErrors.assignee_id = 'Выберите исполнителя';
  else if (!UUID_RE.test(assignee_id))
    fieldErrors.assignee_id = 'Некорректный идентификатор';

  let due_at: string | null = null;
  if (due_at_local) {
    const iso = localToIso(due_at_local);
    if (!iso) {
      fieldErrors.due_at = 'Некорректная дата';
    } else {
      due_at = iso;
    }
  }

  // hearing требует время — это в чек CLAUDE.md (заседание без времени бессмысленно).
  if (kind_raw === 'hearing' && !due_at) {
    fieldErrors.due_at = 'Для заседания укажите дату и время';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        fieldErrors,
        values,
        message: 'Проверьте поля формы',
      },
    };
  }

  return {
    ok: true,
    data: {
      case_id,
      title,
      description: description || null,
      kind: kind_raw as TaskKind,
      assignee_id,
      due_at,
    },
    values,
  };
}

export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const user = await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();
  const { data: insertedTask, error } = await supabase
    .from('tasks')
    .insert({
      ...result.data,
      // RLS WITH CHECK требует created_by = active_uid(); ставим явно из сессии.
      created_by: user.profile.id,
      status: 'open' as TaskStatus,
    })
    .select('id')
    .single();

  if (error || !insertedTask) {
    return {
      ok: false,
      values: result.values,
      message: error?.message ?? 'Не удалось создать задачу',
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: result.data.case_id,
    action: 'task_created',
    changes: {
      task_id: insertedTask.id,
      title: result.data.title,
      kind: result.data.kind,
      assignee_id: result.data.assignee_id,
      due_at: result.data.due_at,
    },
  });

  revalidatePath(`/cases/${result.data.case_id}`);
  revalidatePath('/tasks');
  revalidatePath('/calendar');
  revalidatePath('/', 'layout'); // обновить sidebar counter
  return { ok: true };
}

const TASK_DIFF_FIELDS = [
  'title',
  'kind',
  'assignee_id',
  'due_at',
] as const;

type TaskDiffShape = {
  title: string;
  kind: TaskKind;
  assignee_id: string;
  due_at: string | null;
};

export async function updateTaskAction(
  taskId: string,
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  await requireUser();
  const result = validate(formData);
  if (!result.ok) return result.state;

  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from('tasks')
    .select('title, kind, assignee_id, due_at, case_id')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('tasks')
    .update({
      title: result.data.title,
      description: result.data.description,
      kind: result.data.kind,
      assignee_id: result.data.assignee_id,
      due_at: result.data.due_at,
    })
    .eq('id', taskId);

  if (error) {
    return {
      ok: false,
      values: result.values,
      message: error.message,
    };
  }

  if (before) {
    const beforeShape: TaskDiffShape = {
      title: String(before.title ?? ''),
      kind: before.kind as TaskKind,
      assignee_id: String(before.assignee_id ?? ''),
      due_at: (before.due_at as string | null) ?? null,
    };
    const afterShape: Partial<TaskDiffShape> = {
      title: result.data.title,
      kind: result.data.kind,
      assignee_id: result.data.assignee_id,
      due_at: result.data.due_at,
    };
    const diff = diffChanges(beforeShape, afterShape, TASK_DIFF_FIELDS);
    if (diff) {
      await logActivity({
        entity_type: 'case',
        entity_id: result.data.case_id,
        action: 'task_updated',
        changes: { task_id: taskId, title: result.data.title, diff },
      });
    }
  }

  revalidatePath(`/cases/${result.data.case_id}`);
  revalidatePath('/tasks');
  revalidatePath('/calendar');
  revalidatePath('/', 'layout');
  return { ok: true };
}

// Bare action: переключает open ⇄ done. Форма передаёт task_id, current_status, case_id.
// Используется на чекбоксе в task-row.
export async function toggleTaskStatusAction(formData: FormData): Promise<void> {
  await requireUser();
  const task_id = getString(formData, 'task_id');
  const current = getString(formData, 'current_status');
  const case_id = getString(formData, 'case_id');

  if (!task_id || !UUID_RE.test(task_id)) return;
  if (!isTaskStatus(current)) return;

  const next: TaskStatus = current === 'open' ? 'done' : 'open';
  const supabase = await createSupabaseServerClient();

  // Берём title до апдейта — для удобства лог-чтения.
  const { data: taskRow } = await supabase
    .from('tasks')
    .select('title, case_id')
    .eq('id', task_id)
    .maybeSingle();

  const { error } = await supabase
    .from('tasks')
    .update({ status: next })
    .eq('id', task_id);

  if (error) {
    console.error('toggleTaskStatusAction failed:', error.message);
    return;
  }

  // CSO #2: case_id для лога берём из taskRow (DB-truth), не из formData.
  if (taskRow?.case_id && UUID_RE.test(taskRow.case_id)) {
    const trueCid = taskRow.case_id;
    await logActivity({
      entity_type: 'case',
      entity_id: trueCid,
      action: 'task_toggled',
      changes: { task_id, title: taskRow.title, status: next },
    });
    revalidatePath(`/cases/${trueCid}`);
  } else if (case_id && UUID_RE.test(case_id)) {
    revalidatePath(`/cases/${case_id}`);
  }
  revalidatePath('/tasks');
  revalidatePath('/calendar');
  revalidatePath('/', 'layout');
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  await requireUser();
  const task_id = getString(formData, 'task_id');
  const case_id = getString(formData, 'case_id');

  if (!task_id || !UUID_RE.test(task_id)) {
    redirect('/tasks?error=missing_id');
  }

  const supabase = await createSupabaseServerClient();

  // Снапшот для лога. Можно логировать ПОСЛЕ delete (tasks → case_id жив, RLS
  // can_see_case продолжит работать). Но title после delete не достанем — поэтому
  // читаем заранее.
  const { data: taskBefore } = await supabase
    .from('tasks')
    .select('title, case_id')
    .eq('id', task_id)
    .maybeSingle();

  const { error } = await supabase.from('tasks').delete().eq('id', task_id);

  if (error) {
    if (case_id && UUID_RE.test(case_id)) {
      redirect(`/cases/${case_id}?error=task_delete_failed`);
    }
    redirect('/tasks?error=delete_failed');
  }

  // CSO #2: case_id для лога берём из taskBefore (DB-truth), не из formData.
  if (taskBefore?.case_id && UUID_RE.test(taskBefore.case_id)) {
    const trueCid = taskBefore.case_id;
    await logActivity({
      entity_type: 'case',
      entity_id: trueCid,
      action: 'task_deleted',
      changes: { task_id, title: taskBefore.title },
    });
    revalidatePath(`/cases/${trueCid}`);
  } else if (case_id && UUID_RE.test(case_id)) {
    revalidatePath(`/cases/${case_id}`);
  }
  revalidatePath('/tasks');
  revalidatePath('/calendar');
  revalidatePath('/', 'layout');
}
