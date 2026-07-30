'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useShakeInvalidFields } from '@/components/ui/use-shake-invalid-fields';
import { useI18n } from '@/lib/i18n/provider';
import { loginAction, type LoginFormState } from './actions';

type Props = {
  next: string;
};

const INITIAL_STATE: LoginFormState = {};

export function LoginForm({ next }: Props) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<LoginFormState, FormData>(
    loginAction,
    INITIAL_STATE,
  );
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Неверный вход помечает оба поля aria-invalid → красный бордер + тряска.
  useShakeInvalidFields(formRef, state);

  // После неудачной попытки — фокус в пароль с выделением: можно сразу
  // набрать правильный поверх, не стирая старый.
  useEffect(() => {
    if (!state?.error) return;
    const el = passwordRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [state]);

  return (
    // Отправляем action вручную из onSubmit, а НЕ через <form action={…}>
    // (2026-07-30, замечание владельца). React сбрасывает форму после каждого
    // вызова server action, и при неверном пароле логин с паролем стирались.
    // preventDefault + ручной вызов сброса не делает, поэтому поля остаются
    // неконтролируемыми (браузер хранит текст сам) — при быстром наборе ни
    // один символ не теряется, а автозаполнение работает как обычно.
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-5 w-full"
      noValidate
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t.auth.login.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder={t.auth.login.emailPlaceholder}
          aria-invalid={state?.error ? 'true' : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.auth.login.passwordLabel}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            ref={passwordRef}
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder={t.auth.login.passwordPlaceholder}
            className="pr-10"
            aria-invalid={state?.error ? 'true' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.auth.login.hidePassword : t.auth.login.showPassword}
            aria-pressed={showPassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text hover:bg-primary-softer transition-colors"
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
        {pending ? t.auth.login.submitting : t.auth.login.submit}
      </Button>
    </form>
  );
}
