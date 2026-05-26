import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// СИСТЕМНЫЙ клиент Supabase с service_role — ПОЛНЫЙ ОБХОД RLS.
// CLAUDE.md §2: использовать ТОЛЬКО для системных задач:
//   - сидинг (scripts/seed.ts)
//   - принудительный signOut при деактивации сотрудника
//   - фоновые операции
//
// НИКОГДА не использовать в Server Components, Server Actions или Route Handlers
// для обычных пользовательских запросов — RLS обойдётся молча.
//
// Импорт этого модуля помечает файл как server-only — если кто-то случайно
// затянет его в клиентский бандл, сборка упадёт.
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.',
    );
  }

  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
