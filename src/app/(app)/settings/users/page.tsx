import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Mail, Shield, Users } from 'lucide-react';

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
import { requireAnyCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/utils';
import { listManagedUsers } from '@/lib/users/queries';
import { listActiveDepartments } from '@/lib/departments/queries';
import { listManagedUserSalaries } from '@/lib/payroll/queries';
import { assignableRoles } from '@/lib/types/db';
import { UserCreateForm } from '@/components/users/user-create-form';

// Управление пользователями: список — только просмотр и переход (2026-07-16),
// все настройки (роль, подразделение, зарплата, права, доступ) — на карточке
// сотрудника /settings/users/[id]. Доступ — manage_users ИЛИ create_users
// (сплит 2026-07-16): «только создающий» видит список и форму создания,
// правки на карточке гейтятся отдельно.
export default async function UsersSettingsPage() {
  const actor = await requireAnyCap(['manage_users', 'create_users']);
  const [users, departments, salaries] = await Promise.all([
    listManagedUsers(),
    listActiveDepartments(),
    listManagedUserSalaries(),
  ]);
  // Режим/оклад читаются только через DEFINER-RPC (salary_* защищены column-level
  // привилегиями). Сопоставляем по user_id; отсутствие строки → скрыто («—»).
  const salaryById = new Map(salaries.map((s) => [s.user_id, s]));
  // Роли для ФОРМЫ СОЗДАНИЯ — от права create_users (ступенчатость та же).
  const assignable = assignableRoles(actor.profile.role, actor.caps.create_users);
  const actorIsOwner = actor.profile.role === 'owner';
  const { t, fmt } = await getT();

  const backHref = '/settings';
  const backLabel = t.nav.settings;

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {backLabel}
      </Link>

      {/* Создание пользователя — только обладателю права create_users. */}
      {actor.caps.create_users && (
        <section className="flex flex-col gap-3">
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="text-[15px] font-semibold text-text">{t.users.heading}</h2>
            </div>
            <div className="p-5">
              <p className="mb-4 text-[13px] text-text-muted">
                {actor.profile.role === 'owner'
                  ? t.users.introOwner
                  : t.users.introManager}
              </p>
              <UserCreateForm
                assignableRoles={assignable}
                actorRole={actor.profile.role}
                actorCaps={actor.caps}
                departments={departments}
                actorIsOwner={actorIsOwner}
              />
            </div>
          </Card>
        </section>
      )}

      {/* Мини-статистика — из уже загруженного списка, без новых запросов */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
            <Users size={16} strokeWidth={1.75} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-text-muted">
              {t.users.stats.total}
            </span>
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-text">
              {users.length}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
            <Check size={16} strokeWidth={1.75} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-text-muted">
              {t.users.stats.active}
            </span>
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-text">
              {users.filter((u) => u.is_active).length}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning">
            <Shield size={16} strokeWidth={1.75} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[11.5px] font-medium text-text-muted">
              {t.users.stats.admins}
            </span>
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-text">
              {users.filter((u) => u.role === 'owner' || u.role === 'admin').length}
            </span>
          </span>
        </div>
      </div>

      {/* Список пользователей: строка целиком — переход на карточку сотрудника */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-auto">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text">{t.users.listHeading}</h2>
        </div>
        <Table>
          <TableHeader className="bg-surface-sunken">
            <TableRow>
              <TableHead>{t.users.table.colUser}</TableHead>
              <TableHead>{t.users.table.colRole}</TableHead>
              <TableHead>{t.users.table.colDepartment}</TableHead>
              <TableHead>{t.users.salary.column}</TableHead>
              <TableHead>{t.users.table.colStatus}</TableHead>
              <TableHead className="w-10" aria-hidden="true" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const sal = salaryById.get(u.id);
              const salaryLabel =
                !u.is_active || !sal
                  ? null
                  : sal.salary_mode === 'percent'
                    ? t.users.salary.none
                    : `${t.enums.salaryMode[sal.salary_mode]}${
                        sal.salary_fixed_amount != null
                          ? ` · ${fmt(t.users.salary.perMonth, {
                              amount: formatMoney(sal.salary_fixed_amount),
                            })}`
                          : ''
                      }`;
              return (
                <TableRow
                  key={u.id}
                  className={
                    u.is_active
                      ? 'group relative cursor-pointer hover:bg-primary-softer'
                      : 'group relative cursor-pointer hover:bg-primary-softer opacity-60'
                  }
                >
                  <TableCell>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <span className="flex flex-col">
                        {/* after-оверлей делает кликабельной всю строку (tr — relative). */}
                        <Link
                          href={`/settings/users/${u.id}`}
                          title={t.users.row.open}
                          className="text-[13.5px] font-semibold text-text transition-colors group-hover:text-primary-pressed after:absolute after:inset-0 after:content-['']"
                        >
                          {u.full_name}
                        </Link>
                        <span className="flex items-center gap-1 text-[11.5px] text-text-subtle">
                          <Mail size={10} strokeWidth={2} />
                          {u.email}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge tone="neutral" quiet>
                      {t.enums.role[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col leading-tight">
                      <span className="text-[13px] text-text">
                        {u.department_name ?? t.departments.assign.none}
                      </span>
                      {u.position && (
                        <span className="text-[12px] text-text-muted">
                          {u.position}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {salaryLabel ? (
                      <span className="text-[13px] text-text">{salaryLabel}</span>
                    ) : (
                      <span className="text-[12px] text-text-subtle">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge tone="success" quiet>{t.users.table.statusActive}</Badge>
                    ) : (
                      <Badge tone="neutral" quiet>{t.users.table.statusInactive}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="inline text-text-subtle transition-colors group-hover:text-primary"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-muted/50">
          <span className="text-[12px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
            {t.users.table.totalLabel}
          </span>
          <span className="font-mono tabular-nums font-bold text-text">
            {users.length}
          </span>
        </div>
      </div>

      <p className="text-[12px] text-text-subtle">{t.users.footnote}</p>
    </main>
  );
}
