import { type NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/lib/supabase/server';

// Обработчик ссылок из писем Supabase (приглашение/восстановление пароля —
// sendUserInviteAction). Поддерживает оба потока: PKCE (?code) и OTP
// (?token_hash&type). После успеха — редирект на ?next (только относительный путь,
// дефолт /profile), иначе — на /login.
//
// Сессия устанавливается в cookie серверным клиентом (@supabase/ssr), поэтому
// сотрудник попадает внутрь уже авторизованным и может задать свой пароль.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const nextRaw = searchParams.get('next') ?? '/profile';
  // Анти-open-redirect: только относительные пути.
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/profile';

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error('[auth/confirm] exchangeCodeForSession:', error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error('[auth/confirm] verifyOtp:', error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
