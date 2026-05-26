'use client';

import { useActionState } from 'react';
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
    <form action={action} className="flex flex-col gap-4 w-full max-w-sm" noValidate>
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-200"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Пароль</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-200"
        />
      </label>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-zinc-900 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
