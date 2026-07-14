import Link from 'next/link';
import { Check, ChevronLeft, Coins } from 'lucide-react';

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

      <Card className="p-4 sm:p-6 lg:p-8">
        <PayrollRatesForm rates={map} />
      </Card>

      {/* Пояснение расчёта — наши правила (§7-4 CLAUDE.md), тексты в i18n */}
      <Card>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
            <Coins size={16} strokeWidth={1.75} />
          </span>
          <h2 className="text-[15px] font-semibold text-text">
            {t.payroll.settings.how.title}
          </h2>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[13px] leading-relaxed text-text-muted">
            {t.payroll.settings.how.formulaIntro}{' '}
            <span className="font-semibold text-text">
              {t.payroll.settings.how.formulaFixed}
            </span>
            {' + '}
            <span className="font-semibold text-text">
              {t.payroll.settings.how.formulaPercent}
            </span>
            {' + '}
            <span className="font-semibold text-text">
              {t.payroll.settings.how.formulaBonus}
            </span>
          </p>
          <ul className="flex flex-col gap-2 border-t border-border pt-4 text-[12.5px] text-text-muted">
            {[
              t.payroll.settings.how.pointRates,
              t.payroll.settings.how.pointFullPercent,
              t.payroll.settings.how.pointBase,
              t.payroll.settings.how.pointModes,
            ].map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </main>
  );
}
