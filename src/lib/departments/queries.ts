import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';
import type { Department, DepartmentWithCount } from '@/lib/types/db';

// Справочник подразделений со счётчиком активных сотрудников.
// RLS departments_select_active разрешает чтение любому активному сотруднику;
// привязки людей считаем отдельной выборкой users (department_id, is_active) —
// users_select_all тоже видна всем активным. Считаем в JS: подразделений ~10,
// сотрудников ~сотни — дешевле один проход, чем агрегат на каждый ряд.
export async function listDepartmentsWithCounts(): Promise<DepartmentWithCount[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const uid = user.profile.id;

  // Две независимые выборки — параллельными userDb-транзакциями (норма §4.3).
  const [depts, members] = await Promise.all([
    userDb(uid, (tx) =>
      tx.departments.findMany({
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, is_active: true, created_at: true },
      }),
    ),
    userDb(uid, (tx) =>
      tx.public_users.findMany({
        where: { is_active: true },
        select: { department_id: true },
      }),
    ),
  ]);

  const counts = new Map<string, number>();
  for (const u of members) {
    if (u.department_id) counts.set(u.department_id, (counts.get(u.department_id) ?? 0) + 1);
  }

  return depts.map((d) => ({
    id: d.id,
    name: d.name,
    is_active: d.is_active,
    created_at: ts(d.created_at),
    member_count: counts.get(d.id) ?? 0,
  }));
}

// Активные подразделения для селектов (фильтр дел/отчётов, назначение сотрудника).
export async function listActiveDepartments(): Promise<Department[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.departments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, is_active: true, created_at: true },
    }),
  );
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    is_active: d.is_active,
    created_at: ts(d.created_at),
  }));
}
