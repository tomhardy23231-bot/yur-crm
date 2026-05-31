'use client';

import { useActionState, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { loginAction, type LoginFormState } from './actions';

type Props = {
  next: string;
};

const INITIAL_STATE: LoginFormState = {};

export function LoginForm({ next }: Props) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(
    loginAction,
    INITIAL_STATE,
  );
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Неверный вход помечает оба поля aria-invalid → красный бордер + тряска.
  useShakeInvalidFields(formRef, state);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5 w-full" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@firm.local"
          aria-invalid={state?.error ? 'true' : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Пароль</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="pr-10"
            aria-invalid={state?.error ? 'true' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            aria-pressed={showPassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff size={16} strokeWidth={1.75} />
            ) : (
              <Eye size={16} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-error-bg px-3 py-2 text-[13px] text-error font-medium animate-field-error"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full h-10 mt-1">
        {pending ? 'Входим…' : 'Войти'}
      </Button>
    </form>
  );
}
