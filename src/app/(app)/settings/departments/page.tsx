import Link from 'next/link';
import { ChevronLeft, Building2, Users } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { listDepartmentsWithCounts } from '@/lib/departments/queries';
import { listManagedUsers } from '@/lib/users/queries';
import { DepartmentCreateForm } from '@/components/departments/department-create-form';
import {
  DepartmentNameControl,
  DepartmentActiveControl,
} from '@/components/departments/department-row-controls';
import { UserAssignmentEditor } from '@/components/users/user-assignment-editor';
import type { Department, ManagedUser } from '@/lib/types/db';

// Управление структурой компании — только владелец (RLS departments_write_owner
// дублирует). Список подразделений + команда каждого + назначение людей.
export default async function DepartmentsSettingsPage() {
  await requireRole(['owner']);
  const { t, plural } = await getT();

  const [departments, users] = await Promise.all([
    listDepartmentsWithCounts(),
    listManagedUsers(),
  ]);

  // Активные сотрудники, сгруппированные по подразделению (для команды).
  const activeUsers = users.filter((u) => u.is_active);
  const byDept = new Map<string, ManagedUser[]>();
  const unassigned: ManagedUser[] = [];
  for (const u of activeUsers) {
    if (u.department_id) {
      const arr = byDept.get(u.department_id) ?? [];
      arr.push(u);
      byDept.set(u.department_id, arr);
    } else {
      unassigned.push(u);
    }
  }

  // Активные подразделения для селектов назначения (без счётчика).
  const activeDepartments: Department[] = departments
    .filter((d) => d.is_active)
    .map((d) => ({
      id: d.id,
      name: d.name,
      is_active: d.is_active,
      created_at: d.created_at,
    }));

  function membersLabel(n: number): string {
    return plural(
      {
        one: t.departments.list.membersOne,
        few: t.departments.list.membersFew,
        many: t.departments.list.membersMany,
      },
      n,
    );
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.nav.settings}
      </Link>

      {/* Создание подразделения */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <Building2 size={16} strokeWidth={1.75} className="text-text-muted" />
          {t.departments.heading}
        </h2>
        <p className="text-[13px] text-text-muted">{t.departments.intro}</p>
        <Card className="p-5">
          <DepartmentCreateForm />
        </Card>
      </section>

      {/* Подразделения и команды */}
      {departments.length === 0 ? (
        <p className="text-[13px] text-text-muted">{t.departments.list.empty}</p>
      ) : (
        <section className="flex flex-col gap-3">
          {departments.map((d) => {
            const team = byDept.get(d.id) ?? [];
            return (
              <Card
                key={d.id}
                className={d.is_active ? 'overflow-hidden' : 'overflow-hidden opacity-70'}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <DepartmentNameControl id={d.id} name={d.name} />
                    {d.is_active ? (
                      <Badge tone="success" quiet>
                        {t.departments.list.statusActive}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" quiet>
                        {t.departments.list.statusInactive}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                      <Users size={13} strokeWidth={1.75} />
                      {membersLabel(d.member_count)}
                    </span>
                    <DepartmentActiveControl id={d.id} isActive={d.is_active} />
                  </div>
                </div>

                {team.length === 0 ? (
                  <p className="px-5 py-4 text-[13px] text-text-muted">
                    {t.departments.list.emptyTeam}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {team.map((u) => (
                      <TeamRow
                        key={u.id}
                        user={u}
                        departments={activeDepartments}
                        roleLabel={t.enums.role[u.role]}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {/* Вне структуры */}
      {unassigned.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[14px] font-semibold text-text">
            {t.departments.assign.none}
          </h3>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {unassigned.map((u) => (
                <TeamRow
                  key={u.id}
                  user={u}
                  departments={activeDepartments}
                  roleLabel={t.enums.role[u.role]}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </main>
  );
}

function TeamRow({
  user,
  departments,
  roleLabel,
}: {
  user: ManagedUser;
  departments: Department[];
  roleLabel: string;
}) {
  const showsScope = user.role === 'admin' || user.role === 'office_manager';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="inline-flex items-center gap-2.5">
        <Avatar name={user.full_name} size="sm" />
        <span className="flex flex-col">
          <span className="text-[13px] text-text">{user.full_name}</span>
          <span className="text-[12px] text-text-muted">{roleLabel}</span>
        </span>
      </span>
      <UserAssignmentEditor
        userId={user.id}
        departmentId={user.department_id}
        departmentName={user.department_name}
        position={user.position}
        visibilityScope={user.visibility_scope}
        showsScope={showsScope}
        departments={departments}
        actorIsOwner
      />
    </li>
  );
}
