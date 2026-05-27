'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  return (
    <form action={action} className="flex flex-col gap-5 w-full" noValidate>
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
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-error-bg px-3 py-2 text-[13px] text-error font-medium"
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
