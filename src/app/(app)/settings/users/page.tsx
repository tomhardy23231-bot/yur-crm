import Link from 'next/link';
import { ChevronLeft, Users } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { requireRole } from '@/lib/auth/require-role';
import { listManagedUsers } from '@/lib/users/queries';
import { assignableRoles, canManageRole } from '@/lib/types/db';
import { UserCreateForm } from '@/components/users/user-create-form';
import {
  UserRoleControl,
  UserActiveControl,
} from '@/components/users/user-row-controls';

// Управление пользователями и ролями (Задача 4). Доступ: owner + admin.
// Ступенчатые права: admin управляет только не-админскими ролями. Проверки
// продублированы в RLS (private.can_manage_target_user) и server-actions.
export default async function UsersSettingsPage() {
  const actor = await requireRole(['owner', 'admin']);
  const users = await listManagedUsers();
  const assignable = assignableRoles(actor.profile.role);

  // K1: страница /settings — owner-only. Для admin крошка «‹ Настройки» вела в
  // /forbidden (хотя сам пункт в меню скрыт). Ведём админа на дашборд, владельца
  // — в общие настройки.
  const backHref = actor.profile.role === 'owner' ? '/settings' : '/';
  const backLabel = actor.profile.role === 'owner' ? 'Настройки' : 'На главную';

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4 max-w-5xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {backLabel}
      </Link>

      {/* Создание пользователя */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <Users size={16} strokeWidth={1.75} className="text-text-muted" />
          Пользователи и роли
        </h2>
        <Card className="p-5">
          <p className="mb-4 text-[13px] text-text-muted">
            {actor.profile.role === 'owner'
              ? 'Создавайте сотрудников и назначайте любые роли.'
              : 'Вы можете заводить и менять роли офис-менеджеров, юристов и экспертов. Владельцев и администраторов меняет только владелец.'}
          </p>
          <UserCreateForm assignableRoles={assignable} />
        </Card>
      </section>

      {/* Список пользователей */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-surface">
              <TableHead>Сотрудник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === actor.profile.id;
              // Менять можно, если роль цели в зоне актора И это не он сам.
              const manageable =
                !isSelf && canManageRole(actor.profile.role, u.role);
              return (
                <TableRow key={u.id} className={u.is_active ? undefined : 'opacity-60'}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <span className="flex flex-col">
                        <span className="text-[13px] text-text">{u.full_name}</span>
                        <span className="text-[12px] text-text-muted font-mono">
                          {u.email}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <UserRoleControl
                      userId={u.id}
                      currentRole={u.role}
                      assignableRoles={assignable}
                      manageable={manageable}
                      isActive={u.is_active}
                    />
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge tone="success">Активен</Badge>
                    ) : (
                      <Badge tone="neutral">Деактивирован</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <UserActiveControl
                        userId={u.id}
                        isActive={u.is_active}
                        manageable={manageable}
                        isSelf={isSelf}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-muted/50">
          <span className="text-[12px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
            Всего сотрудников
          </span>
          <span className="font-mono tabular-nums font-bold text-text">
            {users.length}
          </span>
        </div>
      </div>

      <p className="text-[12px] text-text-subtle">
        Деактивация не удаляет данные: сотрудник теряет доступ, но его дела,
        платежи и начисления сохраняются. Роль каждого пользователя меняется по
        правилам доступа — администратор не управляет владельцами и админами.
      </p>
    </main>
  );
}
