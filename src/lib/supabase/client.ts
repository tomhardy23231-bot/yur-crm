'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Браузерный клиент Supabase для 'use client' компонентов.
// На Шаге 2 используется только в формах логина (через Server Action логин
// тоже работает, но клиент полезен для onAuthStateChange-подписок в будущем).
//
// RLS работает поверх anon-ключа — анонимный ключ безопасно отдавать клиенту.
let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.',
    );
  }

  cached = createBrowserClient(url, anonKey);
  return cached;
}
