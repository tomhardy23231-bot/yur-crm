import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import type { Messages } from '@/lib/i18n/messages';

// Обзор настроек — стартовая правая панель. Разделы вынесены в левый рейл
// (settings/layout.tsx); здесь остаётся вводка + сводная таблица прав (P3.1).
// Доступ — обладателям права управления пользователями ИЛИ системных настроек
// (ставок) ИЛИ управления типами дел. RLS дублирует защиту на стороне БД.
export default async function SettingsPage() {
  const actor = await requireUser();
  const { t } = await getT();
  // Сплит 2026-07-16: в раздел пользователей пускает и право create_users.
  const canManageUsers = actor.caps.manage_users || actor.caps.create_users;
  const canEditRates = actor.caps.edit_payroll_rates;
  const canManageCaseTypes = actor.caps.manage_case_types;
  if (!canManageUsers && !canEditRates && !canManageCaseTypes) redirect('/forbidden');

  return (
    <main
      data-tour="settings-content"
      className="flex flex-col gap-5 px-3 py-2 sm:px-4"
    >
      <p className="text-[13.5px] text-text-muted">{t.settings.overviewLead}</p>

      {/* Сводный список прав (P3.1) */}
      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-text">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-text-muted" />
          {t.settings.capsHeading}
        </h2>
        <Card className="overflow-hidden">
          <CapRow title={t.settings.capSystemSettings} owner admin={false} roles={t.enums.roleShort} />
          <CapRow title={t.settings.capManageUsers} owner admin roles={t.enums.roleShort} />
          <CapRow title={t.settings.capDestructive} owner admin roles={t.enums.roleShort} />
          <CapRow title={t.settings.capAllCasesFinance} owner admin staff roles={t.enums.roleShort} />
          <CapRow title={t.settings.capManageCaseTypes} owner admin roles={t.enums.roleShort} />
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
