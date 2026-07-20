import { ArrowDown, ArrowRight, Check } from 'lucide-react';

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

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpMoney.metaTitle };
}

// ============================================================================
// Справка «Деньги в деле»: сумма/оплачено/долг, платежи, график доплат,
// «Рахунок-Акт» полным циклом, дебиторка.
// ============================================================================

export default async function HelpMoneyPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpMoney;

  const planStatus = {
    paid: { label: h.plan.shotPaidLabel, cls: 'bg-success-bg text-success-text' },
    overdue: { label: h.plan.shotOverdueLabel, cls: 'bg-error-bg text-error-text' },
    pending: { label: h.plan.shotPendingLabel, cls: 'bg-surface-sunken text-text-muted' },
  } as const;

  return (
    <HelpShell slug="money">
      <HelpText html={h.intro} />

      {/* ── Сумма и долг ───────────────────────────────────────── */}
      <HelpSection title={h.finance.title}>
        <HelpText html={h.finance.text1} />
        <HelpShot caption={h.finance.shotCaption}>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] tabular-nums text-text-muted">
                {h.finance.shotPaid}
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-md bg-error-bg px-2 py-0.5 text-[12px] font-bold tabular-nums text-error-text">
                  {h.finance.shotDebt}
                </span>
                <span className="text-[11.5px] font-semibold text-text-muted">
                  {h.finance.shotPct}
                </span>
              </span>
            </div>
            <span className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span className="block h-full w-3/5 rounded-full bg-success" />
            </span>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Платежи ────────────────────────────────────────────── */}
      <HelpSection title={h.payments.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.payments.text1} />
          <HelpText html={h.payments.text2} />
        </div>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.payments.del1} />
        <HelpCallout tone="tip" html={h.payments.del2} />
      </HelpSection>

      {/* ── График платежей ────────────────────────────────────── */}
      <HelpSection title={h.plan.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.plan.text1} />
          <HelpText html={h.plan.text2} />
        </div>
        <HelpShot caption={h.plan.shotCaption}>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface shadow-sm">
            {h.plan.shotRows.map((row) => {
              const s = planStatus[row.status as keyof typeof planStatus];
              return (
                <div
                  key={row.date}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="font-mono text-[12px] tabular-nums text-text-muted">
                    {row.date}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums text-text">
                    {row.sum}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${s.cls}`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Акты ───────────────────────────────────────────────── */}
      <HelpSection title={h.acts.title}>
        <HelpText html={h.acts.text1} />
        <HelpShot caption={h.acts.shotCaption}>
          <div className="mx-auto flex max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {/* Выставлен */}
            <div className="flex-1 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold text-text">{h.acts.shotActNo}</span>
                <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning-text">
                  {h.acts.shotIssued}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-text-muted">
                {h.acts.shotService} · {h.acts.shotSum}
              </p>
              <span className="mt-2 inline-block rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                {h.acts.shotConfirm}
              </span>
            </div>
            <ArrowRight size={18} strokeWidth={2} className="hidden shrink-0 text-text-subtle sm:block" aria-hidden="true" />
            <ArrowDown size={18} strokeWidth={2} className="mx-auto shrink-0 text-text-subtle sm:hidden" aria-hidden="true" />
            {/* Оплачен */}
            <div className="flex-1 rounded-xl border border-success/30 bg-surface p-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold text-text">{h.acts.shotActNo}</span>
                <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success-text">
                  {h.acts.shotPaid}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] font-semibold text-success">
                {h.acts.shotFull}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {[h.acts.shotAuto1, h.acts.shotAuto2, h.acts.shotAuto3].map((a) => (
                  <li key={a} className="flex items-center gap-1.5 text-[11.5px] text-text-muted">
                    <Check size={12} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </HelpShot>
        <div className="flex flex-col gap-2">
          <HelpText html={h.acts.step1} />
          <HelpText html={h.acts.step2} />
          <HelpText html={h.acts.step3} />
          <HelpText html={h.acts.completion} />
        </div>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.acts.deletion} />
      </HelpSection>

      {/* ── Дебиторка ──────────────────────────────────────────── */}
      <HelpSection title={h.receivables.title}>
        <HelpText html={h.receivables.text1} />
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

      <HelpSeeAlso slugs={['payroll', 'stages']} />
    </HelpShell>
  );
}
