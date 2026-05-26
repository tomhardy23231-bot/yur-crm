import { requireUser } from '@/lib/auth/require-role';
import { LogoutButton } from '@/components/logout-button';
import type { Role, SpecialistType } from '@/lib/types/db';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  specialist: 'Специалист',
  assistant: 'Помощник',
};

const SPECIALIST_TYPE_LABEL: Record<SpecialistType, string> = {
  lawyer: 'адвокат',
  jurist: 'юрист',
};

export default async function HomePage() {
  const user = await requireUser();
  const { profile } = user;

  const roleLabel = ROLE_LABEL[profile.role];
  const specialistLabel = profile.specialist_type
    ? ` · ${SPECIALIST_TYPE_LABEL[profile.specialist_type]}`
    : '';

  return (
    <main className="flex flex-1 flex-col items-start gap-12 px-8 py-16 sm:px-16">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Юр CRM
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Добрый день, {profile.full_name}.
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Вы вошли как <strong className="text-zinc-900 dark:text-zinc-100">{roleLabel}</strong>
          {specialistLabel}.
        </p>
      </div>

      <dl className="grid w-full max-w-3xl grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-2">
        <Row label="Email">{profile.email}</Row>
        <Row label="Роль">{roleLabel}</Row>
        {profile.specialist_type && (
          <Row label="Специализация">{SPECIALIST_TYPE_LABEL[profile.specialist_type]}</Row>
        )}
        {profile.supervisor_id && (
          <Row label="Супервайзер" mono>
            {profile.supervisor_id}
          </Row>
        )}
      </dl>

      <LogoutButton />
    </main>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd
        className={`text-sm text-zinc-900 dark:text-zinc-100 ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
