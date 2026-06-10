import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Department, DepartmentWithCount } from '@/lib/types/db';

// Справочник подразделений со счётчиком активных сотрудников.
// RLS departments_select_active разрешает чтение любому активному сотруднику;
// привязки людей считаем отдельной выборкой users (department_id, is_active) —
// users_select_all тоже видна всем активным. Считаем в JS: подразделений ~10,
// сотрудников ~сотни — дешевле один проход, чем агрегат на каждый ряд.
export async function listDepartmentsWithCounts(): Promise<DepartmentWithCount[]> {
  const supabase = await createSupabaseServerClient();

  const [deptRes, usersRes] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name, is_active, created_at')
      .order('is_active', { ascending: false })
      .order('name', { ascending: true }),
    supabase.from('users').select('department_id').eq('is_active', true),
  ]);

  if (deptRes.error) {
    throw new Error(`listDepartmentsWithCounts failed: ${deptRes.error.message}`);
  }
  if (usersRes.error) {
    throw new Error(`listDepartmentsWithCounts (users) failed: ${usersRes.error.message}`);
  }

  const counts = new Map<string, number>();
  for (const u of (usersRes.data ?? []) as Array<{ department_id: string | null }>) {
    if (u.department_id) counts.set(u.department_id, (counts.get(u.department_id) ?? 0) + 1);
  }

  return ((deptRes.data ?? []) as Department[]).map((d) => ({
    ...d,
    member_count: counts.get(d.id) ?? 0,
  }));
}

// Активные подразделения для селектов (фильтр дел/отчётов, назначение сотрудника).
export async function listActiveDepartments(): Promise<Department[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, is_active, created_at')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) {
    throw new Error(`listActiveDepartments failed: ${error.message}`);
  }
  return (data ?? []) as Department[];
}
