import 'server-only';

import { getCurrentUser } from '@/lib/auth/current-user';
import { userDb } from '@/lib/db';
import { ts } from '@/lib/db/convert';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import type {
  ManagedUser,
  PermOverrides,
  Role,
  VisibilityScope,
} from '@/lib/types/db';

function normalizeOverrides(v: unknown): PermOverrides {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as PermOverrides)
    : {};
}

// Список всех сотрудников для экрана «Пользователи и роли» (Задача 4).
// RLS users_select_all разрешает любому активному authenticated видеть всех
// (включая деактивированных — нужно для истории/реактивации). Страница и так под
// requireRole(['owner','admin']); это просто чтение.
//
// v2 Этап 3: + department_id/position/visibility_scope и имя подразделения (join).
//
// Сортировка: активные сверху, затем имя (salary_* НЕ читаем — @ignore/приватны).
export async function listManagedUsers(): Promise<ManagedUser[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await userDb(user.profile.id, (tx) =>
    tx.public_users.findMany({
      orderBy: [{ is_active: 'desc' }, { full_name: 'asc' }],
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
        perm_overrides: true,
        language: true,
        department_id: true,
        position: true,
        visibility_scope: true,
        departments: { select: { name: true } },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    role: r.role as Role,
    is_active: r.is_active,
    created_at: ts(r.created_at),
    perm_overrides: normalizeOverrides(r.perm_overrides),
    language: isLocale(r.language) ? r.language : DEFAULT_LOCALE,
    department_id: r.department_id,
    position: r.position,
    visibility_scope: (r.visibility_scope === 'all'
      ? 'all'
      : 'department') as VisibilityScope,
    department_name: r.departments?.name ?? null,
  }));
}
