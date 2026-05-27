'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createTimeEntryAction,
  type TimeEntryActionState,
  type TimeEntryFields,
} from '@/lib/time-entries/actions';

const INITIAL: TimeEntryActionState = { ok: false };

interface Props {
  caseId: string;
  /** Дефолтная ставка из case.hourly_rate (snapshot копируется в entry). */
  defaultHourlyRate: number | null;
  /** Список tasks этого дела для опциональной привязки. */
  tasks: ReadonlyArray<{ id: string; title: string }>;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function TimeEntryForm({ caseId, defaultHourlyRate, tasks }: Props) {
  const [state, formAction] = useActionState<TimeEntryActionState, FormData>(
    createTimeEntryAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  function err(field: TimeEntryFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="case_id" value={caseId} />

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr]">
        <Field
          label="Время"
          htmlFor="time-entry-minutes"
          error={err('minutes')}
          required
          hint='«1ч 30м», «1.5», «1:30», «90м»'
        >
          <Input
            id="time-entry-minutes"
            name="minutes"
            type="text"
            inputMode="text"
            placeholder="1ч 30м"
            required
            aria-invalid={err('minutes') ? 'true' : undefined}
            className="font-mono tabular-nums"
          />
        </Field>

        <Field
          label="Дата"
          htmlFor="time-entry-date"
          error={err('spent_at')}
          required
        >
          <Input
            id="time-entry-date"
            name="spent_at"
            type="date"
            defaultValue={todayISO()}
            required
            aria-invalid={err('spent_at') ? 'true' : undefined}
            className="font-mono"
          />
        </Field>

        <Field
          label="Ставка, ₴/ч"
          htmlFor="time-entry-rate"
          error={err('hourly_rate')}
          hint={
            defaultHourlyRate != null
              ? `из дела: ${defaultHourlyRate}`
              : 'не задана в деле'
          }
        >
          <Input
            id="time-entry-rate"
            name="hourly_rate"
            type="text"
            inputMode="decimal"
            defaultValue={
              defaultHourlyRate != null ? String(defaultHourlyRate) : ''
            }
            placeholder="0"
            aria-invalid={err('hourly_rate') ? 'true' : undefined}
            className="font-mono tabular-nums"
          />
        </Field>
      </div>

      {tasks.length > 0 && (
        <Field
          label="Задача (опционально)"
          htmlFor="time-entry-task"
          error={err('task_id')}
        >
          <Select id="time-entry-task" name="task_id" defaultValue="">
            <option value="">— без привязки —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Что делал"
        htmlFor="time-entry-note"
        error={err('note')}
      >
        <Textarea
          id="time-entry-note"
          name="note"
          maxLength={500}
          rows={2}
          placeholder="Опционально: подготовка иска, телефонная консультация…"
          aria-invalid={err('note') ? 'true' : undefined}
        />
      </Field>

      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="billable"
          value="on"
          defaultChecked
          className="h-4 w-4 accent-primary cursor-pointer"
        />
        <span className="text-[13px] text-text">Оплачиваемое время</span>
      </label>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      {state.ok && (
        <p
          role="status"
          className="text-sm text-success bg-success-bg border border-success/15 rounded-md px-3 py-2"
        >
          Запись сохранена.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
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
      {!error && hint && (
        <p className="text-[11px] text-text-subtle">{hint}</p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? 'Сохранение…' : 'Залогировать'}
    </Button>
  );
}
