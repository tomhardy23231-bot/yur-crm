import Link from 'next/link';
import { ChevronLeft, FileSpreadsheet } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getOrgRequisites } from '@/lib/org/queries';
import { RequisitesForm } from '@/components/requisites/requisites-form';

// Реквизиты компании-исполнителя для печатной формы акта — только владелец
// (RLS org_requisites_update_owner дублирует).
export default async function RequisitesSettingsPage() {
  await requireRole(['owner']);
  const { t } = await getT();
  const requisites = await getOrgRequisites();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {t.requisites.backToSettings}
      </Link>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <FileSpreadsheet size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-[18px] font-semibold text-text">{t.requisites.title}</h1>
          <p className="text-[13px] text-text-muted">{t.requisites.subtitle}</p>
        </div>
      </div>

      <Card className="p-5">
        <RequisitesForm requisites={requisites} />
      </Card>
    </main>
  );
}
