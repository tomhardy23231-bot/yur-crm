import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/current-user';
import type { Role } from '@/lib/types/db';

// Стражи доступа для Server Components, Server Actions, Route Handlers.
// CLAUDE.md §4: матрица доступа.
//
// `requireUser()` — гарантирует, что в обработчике уже есть авторизованный
// активный сотрудник. Если нет — редирект на /login (для SC/SA это бросает
// специальный сигнал Next, выполнение прерывается).
//
// `requireRole(allowed)` — поверх requireUser, плюс проверка роли. Если роль
// не подходит — редирект на /forbidden.

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(
  allowed: ReadonlyArray<Role>,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.profile.role)) redirect('/forbidden');
  return user;
}
