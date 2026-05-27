'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TaskActionState, TaskFormFields } from '@/lib/tasks/actions';
import type { AssigneeOption } from '@/lib/tasks/queries';
import {
  TASK_KIND_LABEL,
  TASK_KINDS,
  type Task,
} from '@/lib/types/db';

const INITIAL: TaskActionState = { ok: false };

type Action = (
  prev: TaskActionState,
  formData: FormData,
) => Promise<TaskActionState>;

interface TaskFormProps {
  action: Action;
  task?: Task;
  assignees: AssigneeOption[];
  /** Если задан — case_id зафиксирован hidden input (inline-форма на карточке дела). */
  lockedCaseId?: string;
  /** Если задано — assignee_id по умолчанию (например, текущий юзер). */
  defaultAssigneeId?: string;
  submitLabel: string;
  /** Компактная форма (для inline на карточке дела). */
  compact?: boolean;
  onSuccess?: () => void;
}

const ROLE_HINT: Record<string, string> = {
  owner: 'владелец',
  admin: 'админ',
  specialist: 'специалист',
  assistant: 'помощник',
};

export function TaskForm({
  action,
  task,
  assignees,
  lockedCaseId,
  defaultAssigneeId,
  submitLabel,
  compact = false,
}: TaskFormProps) {
  const [state, formAction] = useActionState<TaskActionState, FormData>(
    action,
    INITIAL,
  );

  function value(field: TaskFormFields): string {
    if (state.values && state.values[field] !== undefined) {
      return state.values[field] ?? '';
    }
    if (task) {
      switch (field) {
        case 'case_id':
          return task.case_id;
        case 'title':
          return task.title;
        case 'description':
          return task.description ?? '';
        case 'kind':
          return task.kind;
        case 'assignee_id':
          return task.assignee_id;
        case 'due_at':
          return task.due_at ? isoToLocalInput(task.due_at) : '';
      }
    }
    if (field === 'assignee_id' && defaultAssigneeId) return defaultAssigneeId;
    if (field === 'kind') return 'task';
    return '';
  }

  function err(field: TaskFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  const caseIdValue = lockedCaseId ?? value('case_id');

  return (
    <form
      action={formAction}
      className={
        compact
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-5'
      }
    >
      {lockedCaseId && (
        <input type="hidden" name="case_id" value={lockedCaseId} />
      )}

      <Field
        label="Название"
        htmlFor="task-title"
        error={err('title')}
        required
      >
        <Input
          id="task-title"
          name="title"
          defaultValue={value('title')}
          required
          maxLength={200}
          aria-invalid={err('title') ? 'true' : undefined}
          placeholder="Подготовить иск / Заседание / ..."
        />
      </Field>

      <div className={`grid gap-${compact ? '3' : '4'} grid-cols-1 sm:grid-cols-3`}>
        <Field label="Тип" htmlFor="task-kind" error={err('kind')} required>
          <Select
            id="task-kind"
            name="kind"
            defaultValue={value('kind') || 'task'}
            required
            aria-invalid={err('kind') ? 'true' : undefined}
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Исполнитель"
          htmlFor="task-assignee"
          error={err('assignee_id')}
          required
        >
          <Select
            id="task-assignee"
            name="assignee_id"
            defaultValue={value('assignee_id')}
            required
            aria-invalid={err('assignee_id') ? 'true' : undefined}
          >
            <option value="">— выберите —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} · {ROLE_HINT[a.role] ?? a.role}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Срок" htmlFor="task-due" error={err('due_at')}>
          <Input
            id="task-due"
            name="due_at"
            type="datetime-local"
            defaultValue={value('due_at')}
            aria-invalid={err('due_at') ? 'true' : undefined}
            className="font-mono"
          />
        </Field>
      </div>

      {!compact && (
        <Field
          label="Описание"
          htmlFor="task-description"
          error={err('description')}
        >
          <Textarea
            id="task-description"
            name="description"
            rows={3}
            defaultValue={value('description')}
            placeholder="Контекст, материалы, ссылки"
          />
        </Field>
      )}

      {/* В compact-режиме case_id уже передан hidden input; в полной — нужен Select.
          Пока полная форма используется только из edit, где у нас есть task — case_id
          приходит из task. */}
      {!lockedCaseId && !task && (
        <input type="hidden" name="case_id" value={caseIdValue} />
      )}

      {state.message && !state.fieldErrors && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} compact={compact} />
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[12px] uppercase tracking-[0.04em] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ label, compact }: { label: string; compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size={compact ? 'sm' : 'default'}>
      {pending ? 'Сохранение…' : label}
    </Button>
  );
}

// ISO timestamptz → "YYYY-MM-DDThh:mm" для <input type="datetime-local">.
// Берём локальное время (как пользователь увидит в input).
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
