'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/require-role';
import { logActivity } from '@/lib/activity-log/log';
import { diffChanges } from '@/lib/activity-log/diff';
import { userDb } from '@/lib/db';
import { tsOrNull } from '@/lib/db/convert';
import { dbActionError } from '@/lib/db/errors';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';
import type { Messages } from '@/lib/i18n/messages';
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

function validate(
  formData: FormData,
  t: Messages,
):
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

  if (!case_id) fieldErrors.case_id = t.tasks.errors.selectCase;
  else if (!UUID_RE.test(case_id))
    fieldErrors.case_id = t.tasks.errors.invalidCaseId;

  if (!title) fieldErrors.title = t.tasks.errors.enterTitle;
  else if (title.length > 200)
    fieldErrors.title = t.tasks.errors.titleTooLong;

  if (!kind_raw) fieldErrors.kind = t.tasks.errors.selectKind;
  else if (!isTaskKind(kind_raw)) fieldErrors.kind = t.tasks.errors.invalidKind;

  if (!assignee_id) fieldErrors.assignee_id = t.tasks.errors.selectAssignee;
  else if (!UUID_RE.test(assignee_id))
    fieldErrors.assignee_id = t.tasks.errors.invalidAssignee;

  let due_at: string | null = null;
  if (due_at_local) {
    const iso = localToIso(due_at_local);
    if (!iso) {
      fieldErrors.due_at = t.tasks.errors.invalidDate;
    } else {
      due_at = iso;
    }
  }

  // hearing требует время — это в чек CLAUDE.md (заседание без времени бессмысленно).
  if (kind_raw === 'hearing' && !due_at) {
    fieldErrors.due_at = t.tasks.errors.hearingNeedsDate;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      state: {
        ok: false,
        fieldErrors,
        values,
        message: t.tasks.errors.checkForm,
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
  const { t } = await getT();
  const result = validate(formData, t);
  if (!result.ok) return result.state;

  let newTaskId: string;
  try {
    const inserted = await userDb(user.profile.id, (tx) =>
      tx.tasks.create({
        data: {
          case_id: result.data.case_id,
          title: result.data.title,
          description: result.data.description,
          kind: result.data.kind,
          assignee_id: result.data.assignee_id,
          // due_at (datetime-local ISO) → Date для колонки timestamptz.
          due_at: result.data.due_at ? new Date(result.data.due_at) : null,
          // RLS WITH CHECK требует created_by = active_uid(); ставим явно из сессии.
          created_by: user.profile.id,
          status: 'open',
        },
        select: { id: true },
      }),
    );
    newTaskId = inserted.id;
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError(
        'createTaskAction',
        err,
        t.tasks.errors.createFailed,
        t.errors.db,
      ),
    };
  }

  await logActivity({
    entity_type: 'case',
    entity_id: result.data.case_id,
    action: 'task_created',
    changes: {
      task_id: newTaskId,
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
  const user = await requireUser();
  const { t } = await getT();
  const result = validate(formData, t);
  if (!result.ok) return result.state;

  let before;
  try {
    before = await userDb(user.profile.id, (tx) =>
      tx.tasks.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          kind: true,
          assignee_id: true,
          due_at: true,
          case_id: true,
        },
      }),
    );
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError('updateTaskAction', err, t.tasks.errors.updateFailed, t.errors.db),
    };
  }

  let updatedCount = 0;
  try {
    const upd = await userDb(user.profile.id, (tx) =>
      tx.tasks.updateMany({
        where: { id: taskId },
        data: {
          title: result.data.title,
          description: result.data.description,
          kind: result.data.kind,
          assignee_id: result.data.assignee_id,
          due_at: result.data.due_at ? new Date(result.data.due_at) : null,
        },
      }),
    );
    updatedCount = upd.count;
  } catch (err) {
    return {
      ok: false,
      values: result.values,
      message: dbActionError('updateTaskAction', err, t.tasks.errors.updateFailed, t.errors.db),
    };
  }

  if (before && updatedCount > 0) {
    const beforeShape: TaskDiffShape = {
      title: before.title,
      kind: before.kind,
      assignee_id: before.assignee_id,
      due_at: tsOrNull(before.due_at),
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
  const user = await requireUser();
  const task_id = getString(formData, 'task_id');
  const current = getString(formData, 'current_status');
  const case_id = getString(formData, 'case_id');

  if (!task_id || !UUID_RE.test(task_id)) return;
  if (!isTaskStatus(current)) return;

  const next: TaskStatus = current === 'open' ? 'done' : 'open';

  // Title/case_id берём до апдейта (для лога) + сам апдейт — одной транзакцией.
  let taskRow: { title: string; case_id: string } | null = null;
  let changed = false;
  try {
    const res = await userDb(user.profile.id, async (tx) => {
      const row = await tx.tasks.findUnique({
        where: { id: task_id },
        select: { title: true, case_id: true },
      });
      if (!row) return { row: null, changed: false };
      const upd = await tx.tasks.updateMany({
        where: { id: task_id },
        data: { status: next },
      });
      return { row, changed: upd.count > 0 };
    });
    taskRow = res.row;
    changed = res.changed;
  } catch (err) {
    console.error('toggleTaskStatusAction failed:', err);
    return;
  }

  // CSO #2: case_id для лога берём из taskRow (DB-truth), не из formData.
  if (changed && taskRow?.case_id && UUID_RE.test(taskRow.case_id)) {
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
  const user = await requireUser();
  const task_id = getString(formData, 'task_id');
  const case_id = getString(formData, 'case_id');

  if (!task_id || !UUID_RE.test(task_id)) {
    redirect('/tasks?error=missing_id');
  }

  // Снапшот для лога (до удаления): case_id жив после delete, но title не достанем.
  const taskBefore = await userDb(user.profile.id, (tx) =>
    tx.tasks.findUnique({
      where: { id: task_id },
      select: { title: true, case_id: true },
    }),
  );

  try {
    await userDb(user.profile.id, (tx) => tx.tasks.delete({ where: { id: task_id } }));
  } catch {
    // RLS-отказ невидимой строки → P2025; ведём на понятный экран ошибки.
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
