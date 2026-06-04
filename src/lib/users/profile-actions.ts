'use server';

import { createClient } from '@supabase/supabase-js';

import { requireUser } from '@/lib/auth/require-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';

// Задача 6: смена собственного пароля любым авторизованным пользователем.
// Поток (безопасно, через стандартный Supabase auth):
//   1) валидируем новый пароль и совпадение с повтором;
//   2) проверяем ТЕКУЩИЙ пароль на отдельном клиенте (persistSession:false —
//      без записи cookie/сессии), чтобы нельзя было сменить пароль, не зная
//      старого;
//   3) меняем пароль для текущей сессии (supabase.auth.updateUser).

export type ChangePasswordFields = 'current' | 'next' | 'confirm';

export type ChangePasswordState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<ChangePasswordFields, string>>;
};

const MIN_LEN = 8;
const MAX_LEN = 72; // bcrypt-предел Supabase auth.

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();
  const { t, fmt } = await getT();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const fieldErrors: ChangePasswordState['fieldErrors'] = {};
  if (!current) fieldErrors.current = t.account.password.enterCurrent;
  if (!next) fieldErrors.next = t.account.password.enterNext;
  else if (next.length < MIN_LEN)
    fieldErrors.next = fmt(t.account.password.minLen, { n: MIN_LEN });
  else if (next.length > MAX_LEN)
    fieldErrors.next = fmt(t.account.password.tooLong, { n: MAX_LEN });
  if (next && confirm !== next) fieldErrors.confirm = t.account.password.mismatch;
  if (current && next && current === next) {
    fieldErrors.next = t.account.password.sameAsCurrent;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t.errors.checkForm };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('changePasswordAction: missing Supabase env');
    return { ok: false, message: t.errors.serviceUnavailable };
  }

  // 1) Проверяем текущий пароль на изолированном клиенте (не трогаем сессию).
  const verifier = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signInErr) {
    return { ok: false, fieldErrors: { current: t.account.password.wrongCurrent } };
  }

  // 2) Меняем пароль для текущей сессии пользователя.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error('changePasswordAction.updateUser:', error.message);
    return { ok: false, message: t.account.password.updateFailed };
  }

  return { ok: true, message: t.account.password.successDefault };
}
