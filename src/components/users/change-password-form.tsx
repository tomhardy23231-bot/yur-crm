'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import {
  changePasswordAction,
  type ChangePasswordFields,
  type ChangePasswordState,
} from '@/lib/users/profile-actions';

const INITIAL: ChangePasswordState = { ok: false };

export function ChangePasswordForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  useShakeInvalidFields(formRef, state);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  function err(field: ChangePasswordFields): string | undefined {
    return state.fieldErrors?.[field];
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label={t.account.password.current} htmlFor="cp-current" error={err('current')} required>
        <PasswordInput
          id="cp-current"
          name="current"
          autoComplete="current-password"
          show={show}
          invalid={!!err('current')}
        />
      </Field>

      <Field label={t.account.password.next} htmlFor="cp-next" error={err('next')} required>
        <PasswordInput
          id="cp-next"
          name="next"
          autoComplete="new-password"
          show={show}
          invalid={!!err('next')}
          placeholder={t.account.password.nextPlaceholder}
        />
      </Field>

      <Field label={t.account.password.confirm} htmlFor="cp-confirm" error={err('confirm')} required>
        <PasswordInput
          id="cp-confirm"
          name="confirm"
          autoComplete="new-password"
          show={show}
          invalid={!!err('confirm')}
        />
      </Field>

      <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-text-muted">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.currentTarget.checked)}
          className="h-4 w-4 accent-primary"
        />
        {t.account.password.showPasswords}
      </label>

      {state.message && !state.ok && (
        <p
          role="alert"
          className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
        >
          {state.message}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-md border border-success/15 bg-success-bg px-3 py-2 text-sm text-success"
        >
          {state.message ?? t.account.password.successDefault}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t.account.password.submitting : t.account.password.submit}
        </Button>
      </div>
    </form>
  );
}

function PasswordInput({
  show,
  invalid,
  ...props
}: {
  show: boolean;
  invalid: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      required
      maxLength={72}
      aria-invalid={invalid ? 'true' : undefined}
    />
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
