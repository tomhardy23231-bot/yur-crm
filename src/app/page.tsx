import { requireUser } from '@/lib/auth/require-role';
import { LogoutButton } from '@/components/logout-button';
import { Card, CardHero } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Role, SpecialistType } from '@/lib/types/db';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  specialist: 'Специалист',
  assistant: 'Помощник',
};

const ROLE_TONE: Record<Role, 'info' | 'success' | 'warning' | 'neutral'> = {
  owner: 'warning',
  admin: 'info',
  specialist: 'success',
  assistant: 'neutral',
};

const SPECIALIST_TYPE_LABEL: Record<SpecialistType, string> = {
  lawyer: 'адвокат',
  jurist: 'юрист',
};

export default async function HomePage() {
  const user = await requireUser();
  const { profile } = user;

  const roleLabel = ROLE_LABEL[profile.role];
  const roleTone = ROLE_TONE[profile.role];
  const specialistLabel = profile.specialist_type
    ? SPECIALIST_TYPE_LABEL[profile.specialist_type]
    : null;

  return (
    <main className="flex flex-1 flex-col items-start gap-10 px-8 py-12 sm:px-16">
      <header className="flex w-full max-w-3xl flex-col gap-3">
        <span className="inline-flex items-center gap-2 self-start font-mono text-[11px] uppercase tracking-[0.06em] text-primary bg-primary-subtle px-2.5 py-1 rounded-full font-semibold">
          ▲ Юр CRM
        </span>
        <h1 className="text-[36px] leading-[1.1] tracking-[-0.02em] font-bold text-text">
          Добрый день, {profile.full_name.split(' ')[0]}.
        </h1>
        <p className="text-[15px] text-text-muted leading-[1.55]">
          Сегодня в работе будет всё, что важно. Спокойного дня.
        </p>
      </header>

      <Card className="w-full max-w-3xl">
        <CardHero>
          <Avatar name={profile.full_name} size="xl" className="border-2 border-white/40" />
          <div className="flex-1">
            <p className="text-[20px] font-bold leading-tight">{profile.full_name}</p>
            <p className="text-[13px] opacity-90 mt-0.5">
              {specialistLabel ? `${roleLabel} · ${specialistLabel}` : roleLabel}
            </p>
          </div>
          <Badge
            tone={roleTone}
            className="!text-white !bg-white/20 backdrop-blur"
          >
            {roleLabel}
          </Badge>
        </CardHero>

        <dl className="grid grid-cols-1 gap-x-12 gap-y-5 p-6 sm:grid-cols-2">
          <Row label="Email" mono>
            {profile.email}
          </Row>
          <Row label="Роль">{roleLabel}</Row>
          {specialistLabel && <Row label="Специализация">{specialistLabel}</Row>}
          {profile.supervisor_id && (
            <Row label="Супервайзер" mono>
              {profile.supervisor_id}
            </Row>
          )}
        </dl>
      </Card>

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
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-subtle">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-[13px] text-text' : 'text-[14px] text-text font-medium'}>
        {children}
      </dd>
    </div>
  );
}
