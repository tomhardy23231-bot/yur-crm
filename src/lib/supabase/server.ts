import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Серверный клиент Supabase с сессией пользователя из cookies.
// RLS работает, потому что запросы идут под JWT текущего юзера.
// Используется в Server Components, Server Actions, Route Handlers.
//
// CLAUDE.md §2: НЕ использовать service_role в пользовательских путях.
// Для системных задач — отдельный admin-клиент (см. ./admin.ts).
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.',
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component rendering — cookies нельзя писать.
          // Это нормально: рефреш сессии берёт на себя proxy.ts.
        }
      },
    },
  });
}
