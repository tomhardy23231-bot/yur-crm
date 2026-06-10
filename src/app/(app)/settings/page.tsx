import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Coins, Languages, ShieldCheck, Users, ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import type { Messages } from '@/lib/i18n/messages';

// Хаб настроек — единый вход в администрирование. Доступен обладателям права
// управления пользователями ИЛИ системных настроек (ставок). Каждая карточка
// дополнительно гейтится своим правом; RLS дублирует защиту на стороне БД.
export default async function SettingsPage() {
  const actor = await requireUser();
  const { t } = await getT();
  const canManageUsers = actor.caps.manage_users;
  const canEditRates = actor.caps.edit_payroll_rates;
  const isOwner = actor.profile.role === 'owner';
  if (!canManageUsers && !canEditRates) redirect('/forbidden');

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      {/* Доступные настройки */}
      <section
        data-tour="settings-content"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {canEditRates && (
          <Link
            href="/settings/payroll"
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Coins size={20} strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">
                {t.settings.ratesCard.title}
              </span>
              <span className="block text-[13px] text-text-muted">
                {t.settings.ratesCard.desc}
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="text-text-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}

        {canManageUsers && (
          <Link
            href="/settings/users"
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Users size={20} strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">
                {t.settings.usersCard.title}
              </span>
              <span className="block text-[13px] text-text-muted">
                {t.settings.usersCard.desc}
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="text-text-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}

        {isOwner && (
          <Link
            href="/settings/departments"
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Building2 size={20} strokeWidth={1.75} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">
                {t.settings.departmentsCard.title}
              </span>
              <span className="block text-[13px] text-text-muted">
                {t.settings.departmentsCard.desc}
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="text-text-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}

        {/* Язык интерфейса — персональная настройка (полный экран в профиле). */}
        <Link
          href="/profile"
          className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
            <Languages size={20} strokeWidth={1.75} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-text">
              {t.settings.languageCard.title}
            </span>
            <span className="block text-[13px] text-text-muted">
              {t.settings.languageCard.desc}
            </span>
          </span>
          <ChevronRight
            size={18}
            strokeWidth={1.75}
            className="text-text-subtle transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </section>

      {/* Сводный список прав (P3.1) */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-text-muted" />
          {t.settings.capsHeading}
        </h2>
        <Card className="overflow-hidden">
          <CapRow title={t.settings.capSystemSettings} owner admin={false} roles={t.enums.roleShort} />
          <CapRow title={t.settings.capManageUsers} owner admin roles={t.enums.roleShort} />
          <CapRow title={t.settings.capDestructive} owner admin roles={t.enums.roleShort} />
          <CapRow title={t.settings.capAllCasesFinance} owner admin staff roles={t.enums.roleShort} />
          <CapRow title={t.settings.capRateOverride} owner admin last roles={t.enums.roleShort} />
        </Card>
        <p className="text-[12px] text-text-subtle">{t.settings.capsFootnote}</p>
      </section>
    </main>
  );
}

function CapRow({
  title,
  owner,
  admin,
  staff,
  last,
  roles,
}: {
  title: string;
  owner?: boolean;
  admin?: boolean;
  staff?: boolean;
  last?: boolean;
  roles: Messages['enums']['roleShort'];
}) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 ${last ? '' : 'border-b border-border'}`}
    >
      <span className="flex-1 text-[13.5px] text-text">{title}</span>
      <span className="flex items-center gap-2">
        {owner && <Badge tone="info" quiet>{roles.owner}</Badge>}
        {admin && <Badge tone="neutral" quiet>{roles.admin}</Badge>}
        {staff && <Badge tone="neutral" quiet>{roles.office_manager}</Badge>}
      </span>
    </div>
  );
}
