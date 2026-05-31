'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { ROLE_LABEL, type Role } from '@/lib/types/db';
import {
  createUserAction,
  type CreateUserFields,
  type CreateUserState,
} from '@/lib/users/actions';

const INITIAL: CreateUserState = { ok: false };

interface Props {
  // Роли, которые текущий пользователь вправе назначать (owner — все; admin — без owner/admin).
  assignableRoles: ReadonlyArray<Role>;
}

export function UserCreateForm({ assignableRoles }: Props) {
  const [state, formAction] = useActionState<CreateUserState, FormData>(
    createUserAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  useShakeInvalidFields(formRef, state);

  function err(field: CreateUserFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1fr]">
        <Field label="Имя" htmlFor="user-full-name" error={err('full_name')} required>
          <Input
            id="user-full-name"
            name="full_name"
            type="text"
            maxLength={120}
            placeholder="Иван Петров"
            required
            aria-invalid={err('full_name') ? 'true' : undefined}
          />
        </Field>

        <Field label="Email" htmlFor="user-email" error={err('email')} required>
          <Input
            id="user-email"
            name="email"
            type="email"
            maxLength={200}
            placeholder="user@company.ru"
            required
            aria-invalid={err('email') ? 'true' : undefined}
          />
        </Field>

        <Field label="Роль" htmlFor="user-role" error={err('role')} required>
          <Select
            id="user-role"
            name="role"
            defaultValue=""
            required
            aria-invalid={err('role') ? 'true' : undefined}
          >
            <option value="">— выберите —</option>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="text-sm text-error bg-error-bg border border-error/15 rounded-md px-3 py-2"
        >
          {state.message}
        </p>
      )}

      {state.ok && state.tempPassword && (
        <div
          role="status"
          className="text-sm text-success bg-success-bg border border-success/15 rounded-md px-3 py-2"
        >
          <p className="font-medium">Пользователь создан.</p>
          <p className="mt-1 text-text">
            Передайте сотруднику данные для входа (показаны один раз):
          </p>
          <p className="mt-1 font-mono tabular-nums text-text">
            {state.createdEmail}
            <br />
            Временный пароль: <span className="font-semibold">{state.tempPassword}</span>
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Попросите сменить пароль при первом входе.
          </p>
        </div>
      )}

      <div>
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
        <p className="text-[12px] text-error animate-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      <UserPlus size={14} strokeWidth={1.75} />
      {pending ? 'Создание…' : 'Добавить пользователя'}
    </Button>
  );
}
