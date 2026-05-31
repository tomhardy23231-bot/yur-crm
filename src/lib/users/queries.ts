import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types/db';

// Список всех сотрудников для экрана «Пользователи и роли» (Задача 4).
// RLS users_select_all разрешает любому активному authenticated видеть всех
// (включая деактивированных — нужно для истории/реактивации). Страница и так под
// requireRole(['owner','admin']); это просто чтение.
//
// Сортировка: активные сверху, затем по «весу» роли (владелец → эксперт), затем имя.
export async function listManagedUsers(): Promise<UserProfile[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, is_active, created_at, perm_overrides')
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`listManagedUsers failed: ${error.message}`);
  }
  return (data ?? []) as UserProfile[];
}
