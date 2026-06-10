import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ManagedUser } from '@/lib/types/db';

// Список всех сотрудников для экрана «Пользователи и роли» (Задача 4).
// RLS users_select_all разрешает любому активному authenticated видеть всех
// (включая деактивированных — нужно для истории/реактивации). Страница и так под
// requireRole(['owner','admin']); это просто чтение.
//
// v2 Этап 3: + department_id/position/visibility_scope и имя подразделения (join).
//
// Сортировка: активные сверху, затем по «весу» роли (владелец → эксперт), затем имя.
export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, full_name, email, role, is_active, created_at, perm_overrides, language, ' +
        'department_id, position, visibility_scope, department:department_id(name)',
    )
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`listManagedUsers failed: ${error.message}`);
  }

  type Raw = Omit<ManagedUser, 'department_name'> & {
    department: { name: string } | Array<{ name: string }> | null;
  };

  return ((data ?? []) as unknown as Raw[]).map(({ department, ...rest }) => {
    const dept = Array.isArray(department) ? (department[0] ?? null) : department;
    return { ...rest, department_name: dept?.name ?? null } as ManagedUser;
  });
}
