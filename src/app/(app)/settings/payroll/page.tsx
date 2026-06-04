import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Card } from '@/components/ui/card';
import {
  PayrollRatesForm,
  type CategoryRatePair,
} from '@/components/payroll/payroll-rates-form';
import { requireCap } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getPayrollRates } from '@/lib/payroll/queries';
import { CASE_CATEGORIES, type CaseCategory } from '@/lib/types/db';

// Системная настройка — только owner (RLS payroll_rates_write_owner дублирует).
export default async function PayrollSettingsPage() {
  await requireCap('edit_payroll_rates');
  const { t } = await getT();
  const rates = await getPayrollRates();

  // В карту category → {lawyer, expert}; недостающие — 0 (на случай рассинхрона).
  const map = Object.fromEntries(
    CASE_CATEGORIES.map((c) => [c, { lawyer: 0, expert: 0 }]),
  ) as Record<CaseCategory, CategoryRatePair>;
  for (const r of rates) {
    map[r.category] = { lawyer: r.lawyer_percent, expert: r.expert_percent };
  }

  return (
    <main className="flex flex-col gap-5 px-3 py-2 sm:px-4">
      <Link
        href="/reports/payroll"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12.5px] font-medium text-text-muted shadow-sm transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />{t.payroll.settings.backToPayroll}
      </Link>

      <Card className="p-6 sm:p-8">
        <PayrollRatesForm rates={map} />
      </Card>
    </main>
  );
}
