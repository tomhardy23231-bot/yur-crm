import { ArrowDown, ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import {
  HelpCallout,
  HelpFaq,
  HelpFaqAnswer,
  HelpSection,
  HelpSeeAlso,
  HelpShell,
  HelpShot,
  HelpText,
} from '@/components/help/help-ui';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';
import { getPayrollRates } from '@/lib/payroll/queries';
import type { CaseCategory } from '@/lib/types/db';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpPayroll.metaTitle };
}

// ============================================================================
// Справка «Зарплата и касса»: формула (живые ставки из payroll_rates),
// режимы оплаты, отчёт «Финансы и ЗП», выплаты/премии, касса.
// ============================================================================

const CATEGORY_VARS: Record<CaseCategory, string> = {
  document: '--cat-document',
  claim: '--cat-claim',
  representation: '--cat-representation',
};

export default async function HelpPayrollPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpPayroll;

  // Живые ставки компании; фолбэк — дефолты из словаря.
  const liveRates = await getPayrollRates();
  const categories: CaseCategory[] = ['document', 'claim', 'representation'];
  const rateFor = (category: CaseCategory): string => {
    const r = liveRates.find((x) => x.category === category);
    if (!r) return h.formula.rateFallbacks[category];
    const l = Number(r.lawyer_percent);
    const e = Number(r.expert_percent);
    return l === e ? `${l}%` : `${l}% / ${e}%`;
  };

  return (
    <HelpShell slug="payroll">
      {/* ── Формула и ставки ───────────────────────────────────── */}
      <HelpSection title={h.formula.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.formula.text1} />
          <HelpText html={h.formula.text2} />
          <HelpText html={h.formula.text3} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Живые ставки */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[13px] font-extrabold text-text-muted">
              {h.formula.ratesTitle}
            </h3>
            <div className="flex flex-col gap-2">
              {categories.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                  style={{ background: `var(${CATEGORY_VARS[cat]}-bg)` }}
                >
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: `var(${CATEGORY_VARS[cat]})` }}
                  >
                    {t.enums.caseCategory[cat]}
                  </span>
                  <span
                    className="text-[18px] font-extrabold tabular-nums"
                    style={{ color: `var(${CATEGORY_VARS[cat]})` }}
                  >
                    {rateFor(cat)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-text-subtle">
              {h.formula.ratesNote}
            </p>
          </Card>

          {/* Пример расчёта */}
          <HelpShot caption={h.formula.shotCaption}>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 font-semibold text-cat-claim">
                  {h.formula.shotBadge}
                </span>
                <span className="text-text-muted">{h.formula.shotCase}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums">
                <span className="text-text-muted">
                  {h.formula.shotSum}{' '}
                  <span className="font-bold text-text">{h.formula.shotSumValue}</span>
                </span>
                <span className="text-text-muted">
                  {h.formula.shotPaid}{' '}
                  <span className="font-bold text-success">{h.formula.shotPaidValue}</span>
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {[h.formula.shotLawyer, h.formula.shotExpert].map((role) => (
                  <div key={role} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-semibold text-text">{role}</span>
                    <span className="text-[12px] text-text-subtle">{h.formula.shotBase}</span>
                    <span className="ml-auto whitespace-nowrap rounded-md bg-success-bg px-2.5 py-1 text-[14px] font-bold tabular-nums text-success">
                      {h.formula.shotAmount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </HelpShot>
        </div>
      </HelpSection>

      {/* ── Режимы оплаты ──────────────────────────────────────── */}
      <HelpSection title={h.modes.title}>
        <HelpText html={h.modes.text1} />
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.modes.okladNote} />
      </HelpSection>

      {/* ── Отчёт ──────────────────────────────────────────────── */}
      <HelpSection title={h.report.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.report.text1} />
          <HelpText html={h.report.text2} />
        </div>
        <HelpCallout tone="tip" html={h.report.accumNote} />
        <HelpText html={h.report.whoSees} />
      </HelpSection>

      {/* ── Выплаты и премии ───────────────────────────────────── */}
      <HelpSection title={h.payouts.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.payouts.text1} />
          <HelpText html={h.payouts.text2} />
        </div>
      </HelpSection>

      {/* ── Касса ──────────────────────────────────────────────── */}
      <HelpSection title={h.cash.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.cash.text1} />
          <HelpText html={h.cash.text2} />
          <HelpText html={h.cash.text3} />
        </div>
        <HelpShot caption={h.cash.shotCaption}>
          <div className="mx-auto flex max-w-lg flex-col gap-2.5">
            {[
              { from: h.cash.shotPayment1, to: h.cash.shotAccount1 },
              { from: h.cash.shotPayment2, to: h.cash.shotAccount2 },
            ].map((row) => (
              <div
                key={row.from}
                className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[12.5px] font-semibold text-text shadow-sm">
                  {row.from}
                </span>
                <ArrowRight
                  size={16}
                  strokeWidth={2}
                  className="hidden shrink-0 text-text-subtle sm:block"
                  aria-hidden="true"
                />
                <ArrowDown
                  size={16}
                  strokeWidth={2}
                  className="mx-auto shrink-0 text-text-subtle sm:hidden"
                  aria-hidden="true"
                />
                <span className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-success/30 bg-success-bg px-3.5 py-2.5 text-[12.5px] font-semibold text-success-text shadow-sm">
                  {row.to}
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-bold text-text-subtle">
                    {h.cash.shotAuto}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </HelpShot>
        <HelpCallout tone="tip" html={h.cash.backfillNote} />
      </HelpSection>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <HelpFaq
        title={t.helpNav.faqTitle}
        countLabel={t.helpNav.faqCountLabel}
        items={[
          { q: h.faq.q1, a: <HelpFaqAnswer html={h.faq.a1} /> },
          { q: h.faq.q2, a: <HelpFaqAnswer html={h.faq.a2} /> },
          { q: h.faq.q3, a: <HelpFaqAnswer html={h.faq.a3} /> },
          { q: h.faq.q4, a: <HelpFaqAnswer html={h.faq.a4} /> },
          { q: h.faq.q5, a: <HelpFaqAnswer html={h.faq.a5} /> },
          { q: h.faq.q6, a: <HelpFaqAnswer html={h.faq.a6} /> },
        ]}
      />

      <HelpSeeAlso slugs={['money', 'roles']} />
    </HelpShell>
  );
}
