import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  KeyRound,
  Mail,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireAnyCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { UUID_RE } from '@/lib/validation';
import { getManagedUser } from '@/lib/users/queries';
import { listActiveDepartments } from '@/lib/departments/queries';
import { listManagedUserSalaries } from '@/lib/payroll/queries';
import { assignableRoles, canManageTargetUser } from '@/lib/types/db';
import {
  UserRoleControl,
  UserActiveControl,
} from '@/components/users/user-row-controls';
import { UserAssignmentSection } from '@/components/users/user-assignment-section';
import { UserSalarySection } from '@/components/users/user-salary-section';
import { UserPermsToggles } from '@/components/users/user-perms-toggles';
import { UserCredentialsPanel } from '@/components/users/user-credentials-section';

// Карточка сотрудника: роль, подразделение, зарплата, доступ и персональные
// права в одном месте (2026-07-16; прежде — инлайн-редакторы в строках списка).
// Доступ — manage_users ИЛИ create_users (для «только создающего» карточка
// read-only); зона редактирования — canManageTargetUser + is_active.
export default async function UserCardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requireAnyCap(['manage_users', 'create_users']);
  const { userId } = await params;
  if (!UUID_RE.test(userId)) notFound();

  const [u, departments, salaries] = await Promise.all([
    getManagedUser(userId),
    listActiveDepartments(),
    listManagedUserSalaries(),
  ]);
  if (!u) notFound();
  const { t, fmt } = await getT();

  const isSelf = u.id === actor.profile.id;
  const manageable =
    !isSelf &&
    canManageTargetUser(actor.profile.role, actor.caps.manage_users, u.role);
  const canEditNow = manageable && u.is_active;
  const actorIsOwner = actor.profile.role === 'owner';
  const assignable = assignableRoles(actor.profile.role, actor.caps.manage_users);
  const sal = salaries.find((s) => s.user_id === u.id) ?? null;

  const createdDate = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(u.created_at));

  const note = isSelf
    ? t.users.card.selfNote
    : !manageable
      ? t.users.card.managedByOwnerNote
      : !u.is_active
        ? t.users.card.inactiveNote
        : null;

  const showAccess = actorIsOwner && !isSelf;

  // Роль и подразделение
  const roleCard = (
    <SectionCard
      icon={<Building2 size={16} strokeWidth={1.75} />}
      title={t.users.card.sectionRole}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-4">
        <span className="text-[12px] text-text-muted">
          {t.users.card.roleLabel}
        </span>
        <UserRoleControl
          userId={u.id}
          currentRole={u.role}
          assignableRoles={assignable}
          manageable={canEditNow}
          isActive={u.is_active}
        />
      </div>
      <UserAssignmentSection
        userId={u.id}
        departmentId={u.department_id}
        departmentName={u.department_name}
        position={u.position}
        visibilityScope={u.visibility_scope}
        showsScope={u.role === 'admin' || u.role === 'office_manager'}
        departments={departments}
        actorIsOwner={actorIsOwner}
        canEdit={canEditNow}
      />
    </SectionCard>
  );

  // Зарплата
  const salaryCard = (
    <SectionCard
      icon={<Wallet size={16} strokeWidth={1.75} />}
      title={t.users.card.sectionSalary}
    >
      {sal ? (
        <UserSalarySection
          userId={u.id}
          salaryMode={sal.salary_mode}
          fixedAmount={sal.salary_fixed_amount}
          canEdit={sal.can_edit && u.is_active}
        />
      ) : (
        <p className="text-[13px] text-text-muted">
          {t.users.card.salaryHidden}
        </p>
      )}
      {(actor.caps.view_all_payroll || isSelf) && (
        <Link
          href={`/reports/payroll/${u.id}`}
          className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
        >
          {t.users.card.openPayroll}
          <ArrowRight size={13} strokeWidth={2} />
        </Link>
      )}
    </SectionCard>
  );

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings/users"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.users.card.back}
      </Link>

      {note && (
        <p className="rounded-control border border-info/25 bg-info-bg px-3.5 py-2.5 text-[12.5px] text-info-text">
          {note}
        </p>
      )}

      {/* Шапка: кто это + статус + деактивация */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={u.full_name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-bold tracking-tight text-text">
              {u.full_name}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={12} strokeWidth={2} />
                {u.email}
              </span>
              <span>{fmt(t.users.card.memberSince, { date: createdDate })}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{t.enums.role[u.role]}</Badge>
            {u.is_active ? (
              <Badge tone="success">{t.users.table.statusActive}</Badge>
            ) : (
              <Badge tone="neutral">{t.users.table.statusInactive}</Badge>
            )}
            {manageable && (
              <UserActiveControl
                userId={u.id}
                isActive={u.is_active}
                manageable
                isSelf={false}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Двухколоночная зона. Панель «Доступ и вход» заметно выше остальных,
          поэтому с ней зарплата встаёт слева под роль (колонки ровные);
          без неё — роль слева, зарплата справа. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {showAccess ? (
          <>
            <div className="flex flex-col gap-5">
              {roleCard}
              {salaryCard}
            </div>
            {/* Доступ и вход — только владелец, не для себя */}
            <SectionCard
              icon={<KeyRound size={16} strokeWidth={1.75} />}
              title={t.users.card.sectionAccess}
            >
              <UserCredentialsPanel
                userId={u.id}
                fullName={u.full_name}
                initialEmail={u.email}
              />
            </SectionCard>
          </>
        ) : (
          <>
            {roleCard}
            {salaryCard}
          </>
        )}
      </div>

      {/* Персональные права — тумблеры с эффективными значениями */}
      <SectionCard
        icon={<ShieldCheck size={16} strokeWidth={1.75} />}
        title={t.users.card.sectionPerms}
      >
        <UserPermsToggles
          userId={u.id}
          targetRole={u.role}
          current={u.perm_overrides}
          actorRole={actor.profile.role}
          actorCaps={actor.caps}
          readOnly={!canEditNow}
        />
      </SectionCard>
    </main>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}
