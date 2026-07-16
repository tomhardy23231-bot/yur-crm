import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/current-user';
import type { Role, Capability } from '@/lib/types/db';

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

// `requireCap(cap)` — поверх requireUser, плюс проверка ЭФФЕКТИВНОГО права
// (роль + персональные оверрайды). Если права нет — редирект на /forbidden.
// БД (RLS) дублирует проверку — это лишь ранний и понятный отказ в UI.
export async function requireCap(cap: Capability): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.caps[cap]) redirect('/forbidden');
  return user;
}

// `requireAnyCap(caps)` — как requireCap, но достаточно ЛЮБОГО из прав.
// Для страниц, доступных нескольким половинкам разделённого права
// (сплит 2026-07-16): /reports/cash — view_cash ИЛИ can_manage_cash,
// /settings/users — manage_users ИЛИ create_users.
export async function requireAnyCap(
  caps: ReadonlyArray<Capability>,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!caps.some((cap) => user.caps[cap])) redirect('/forbidden');
  return user;
}
