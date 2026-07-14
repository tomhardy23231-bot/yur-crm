'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/provider';
import type { TaskActionState, TaskFormFields } from '@/lib/tasks/actions';
import type { AssigneeOption } from '@/lib/tasks/queries';
import type { CaseSelectOption } from '@/lib/cases/queries';
import { TASK_KINDS, type Task } from '@/lib/types/db';

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
  /**
   * Глобальный режим (v3 Сессия 6): список видимых дел для обязательного
   * комбобокса «Дело». Передаётся, когда lockedCaseId нет.
   */
  cases?: ReadonlyArray<CaseSelectOption>;
  /** Если задано — assignee_id по умолчанию (например, текущий юзер). */
  defaultAssigneeId?: string;
  /** Предзаполненный срок (формат datetime-local) — например, день из календаря. */
  defaultDueAt?: string;
  submitLabel: string;
  /** Компактная форма (для inline на карточке дела). */
  compact?: boolean;
  onSuccess?: () => void;
}

export function TaskForm({
  action,
  task,
  assignees,
  lockedCaseId,
  cases,
  defaultAssigneeId,
  defaultDueAt,
  submitLabel,
  compact = false,
  onSuccess,
}: TaskFormProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, formAction] = useActionState<TaskActionState, FormData>(
    action,
    INITIAL,
  );

  // Колбэк успеха (закрыть модалку и т.п.). Ref — чтобы effect не перезапускался
  // от нестабильной ссылки на функцию из родителя.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  // Текст тоста: создание/редактирование (task задан = режим edit).
  const successMessage = task ? t.common.saved : t.tasks.form.createdToast;
  useEffect(() => {
    if (state.ok) {
      toast.success(successMessage);
      onSuccessRef.current?.();
    }
  }, [state.ok, toast, successMessage]);

  const roleHint = (role: string): string =>
    (t.tasks.form.roleHint as Record<string, string>)[role] ?? role;

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
    if (field === 'due_at' && defaultDueAt) return defaultDueAt;
    if (field === 'kind') return 'task';
    return '';
  }

  function err(field: TaskFormFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  const caseIdValue = lockedCaseId ?? value('case_id');

  const formRef = useRef<HTMLFormElement>(null);
  useShakeInvalidFields(formRef, state);

  return (
    <form
      ref={formRef}
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

      {/* Глобальный режим: дело выбирается комбобоксом (обязательное поле). */}
      {!lockedCaseId && !task && cases && (
        <Field
          label={t.tasks.form.case}
          htmlFor="task-case"
          error={err('case_id')}
          required
        >
          <Combobox
            id="task-case"
            name="case_id"
            options={cases.map((c) => ({ value: c.id, label: c.number_title }))}
            defaultValue={value('case_id')}
            placeholder={t.tasks.form.caseSelect}
            searchPlaceholder={t.tasks.form.caseSearchPlaceholder}
            emptyText={t.tasks.form.caseEmpty}
            aria-invalid={err('case_id') ? 'true' : undefined}
          />
        </Field>
      )}

      <Field
        label={t.tasks.form.title}
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
          placeholder={t.tasks.form.titlePlaceholder}
        />
      </Field>

      <div className={`grid gap-${compact ? '3' : '4'} grid-cols-1 sm:grid-cols-3`}>
        <Field
          label={t.tasks.form.kind}
          htmlFor="task-kind"
          error={err('kind')}
          required
        >
          <Select
            id="task-kind"
            name="kind"
            defaultValue={value('kind') || 'task'}
            required
            aria-invalid={err('kind') ? 'true' : undefined}
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.enums.taskKind[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t.tasks.form.assignee}
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
            <option value="">{t.tasks.form.assigneeSelect}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} · {roleHint(a.role)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.tasks.form.due} htmlFor="task-due" error={err('due_at')}>
          <Input
            id="task-due"
            name="due_at"
            type="datetime-local"
            defaultValue={value('due_at')}
            aria-invalid={err('due_at') ? 'true' : undefined}
            className=""
          />
        </Field>
      </div>

      {!compact && (
        <Field
          label={t.tasks.form.description}
          htmlFor="task-description"
          error={err('description')}
        >
          <Textarea
            id="task-description"
            name="description"
            rows={3}
            defaultValue={value('description')}
            placeholder={t.tasks.form.descriptionPlaceholder}
          />
        </Field>
      )}

      {/* Режим edit: case_id берётся из task (поле не редактируется). Fallback
          hidden — только для вызова без lockedCaseId/task/cases (сейчас таких нет). */}
      {!lockedCaseId && !task && !cases && (
        <input type="hidden" name="case_id" value={caseIdValue} />
      )}

      {state.message && !state.fieldErrors && (
        <p
          role="alert"
          className="text-sm text-error-text bg-error-bg border border-error/15 rounded-control px-3 py-2"
        >
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton
          label={submitLabel}
          savingLabel={t.tasks.form.saving}
          compact={compact}
        />
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
        className="text-[12px] text-text-muted"
      >
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  label,
  savingLabel,
  compact,
}: {
  label: string;
  savingLabel: string;
  compact: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size={compact ? 'sm' : 'default'}>
      {pending ? savingLabel : label}
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
