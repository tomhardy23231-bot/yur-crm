import { Banknote, Landmark, Plus, Receipt, RefreshCw, TriangleAlert, Wallet } from 'lucide-react';

import {
  HelpCallout,
  HelpFaq,
  HelpFaqAnswer,
  HelpSection,
  HelpSeeAlso,
  HelpShell,
  HelpShot,
  HelpSteps,
  HelpText,
} from '@/components/help/help-ui';
import { requireUser } from '@/lib/auth/require-role';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpCash.metaTitle };
}

// ============================================================================
// Справка «Касса и расходы» (2026-07-26): развёрнутая версия инструкции из
// модалки обновления 2.11 — счета и дата начального остатка, синхронизация,
// два вида расходов, разбор старых платежей-«витрат».
// ============================================================================

export default async function HelpCashPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpCash;

  return (
    <HelpShell slug="cash">
      <HelpText html={h.intro} />

      {/* ── Счета ──────────────────────────────────────────────── */}
      <HelpSection title={h.accounts.title}>
        <HelpText html={h.accounts.text1} />
        <HelpText html={h.accounts.text2} />

        <HelpShot caption={h.accounts.shotCaption}>
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="min-w-[200px] flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className="h-1 w-full bg-primary" aria-hidden="true" />
              <div className="flex flex-col gap-1.5 p-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
                  <Landmark size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <p className="text-[12.5px] font-medium text-text-muted">
                  {h.accounts.accountName}
                </p>
                <p className="font-mono text-[19px] font-bold leading-none tabular-nums text-text">
                  48 200 <span className="text-[11px] text-text-subtle">₴</span>
                </p>
                <p className="text-[11px] text-text-subtle">{h.accounts.accountOpening}</p>
              </div>
            </div>
            <div className="flex min-w-[160px] flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 p-3.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-hover px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-brand">
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                {h.accounts.addAccount}
              </span>
            </div>
          </div>
        </HelpShot>

        <HelpCallout
          tone="warning"
          title={h.accounts.dateWarnTitle}
          html={h.accounts.dateWarnHtml}
        />
        <HelpText html={h.accounts.deleteHtml} />
      </HelpSection>

      {/* ── Порядок действий ───────────────────────────────────── */}
      <HelpSection title={h.start.title}>
        <HelpSteps
          icon={Wallet}
          title={h.start.stepsTitle}
          steps={[h.start.step1, h.start.step2, h.start.step3, h.start.step4]}
        />

        <HelpShot caption={h.start.syncCaption}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
            <TriangleAlert
              size={15}
              strokeWidth={1.75}
              className="shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-text">
              <span className="font-medium">{h.start.syncNotice}</span>{' '}
              <span className="text-text-muted">{h.start.syncHint}</span>
            </p>
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-white">
              <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
              {h.start.syncButton}
            </span>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Как читать ─────────────────────────────────────────── */}
      <HelpSection title={h.read.title}>
        <HelpText html={h.read.text1} />
        <HelpText html={h.read.text2} />
        <HelpCallout tone="tip" html={h.read.calloutHtml} />
      </HelpSection>

      {/* ── Два вида расходов ──────────────────────────────────── */}
      <HelpSection title={h.kinds.title}>
        <HelpText html={h.kinds.text1} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-text">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-info-bg text-info">
                <Receipt size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              {h.kinds.caseTitle}
            </span>
            <p
              className="text-[13px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
              dangerouslySetInnerHTML={{ __html: h.kinds.caseText }}
            />
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-text">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-warning-bg text-warning">
                <Banknote size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              {h.kinds.companyTitle}
            </span>
            <p
              className="text-[13px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
              dangerouslySetInnerHTML={{ __html: h.kinds.companyText }}
            />
          </div>
        </div>

        <HelpText html={h.kinds.text2} />
        <HelpCallout tone="success" html={h.kinds.salaryHtml} />
        <HelpCallout tone="tip" html={h.kinds.payrollHtml} />
      </HelpSection>

      {/* ── Разбор старых записей ──────────────────────────────── */}
      <HelpSection title={h.cleanup.title}>
        <HelpCallout
          tone="danger"
          title={h.cleanup.calloutTitle}
          html={h.cleanup.calloutHtml}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="text-[13.5px] font-bold text-text">{h.cleanup.whyTitle}</h3>
            <p
              className="text-[13px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
              dangerouslySetInnerHTML={{ __html: h.cleanup.whyText }}
            />
          </div>
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="text-[13.5px] font-bold text-text">{h.cleanup.badTitle}</h3>
            <p
              className="text-[13px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
              dangerouslySetInnerHTML={{ __html: h.cleanup.badText }}
            />
          </div>
        </div>

        <HelpSteps
          title={h.cleanup.howTitle}
          steps={[
            h.cleanup.step1,
            h.cleanup.step2,
            h.cleanup.step3,
            h.cleanup.step4,
          ]}
        />

        <HelpCallout tone="danger" html={h.cleanup.doubtHtml} />
        <HelpCallout tone="warning" html={h.cleanup.afterHtml} />
      </HelpSection>

      <HelpFaq
        title={t.helpNav.faqTitle}
        countLabel={t.helpNav.faqCountLabel}
        items={[
          { q: h.faq.q1, a: <HelpFaqAnswer html={h.faq.a1} /> },
          { q: h.faq.q2, a: <HelpFaqAnswer html={h.faq.a2} /> },
          { q: h.faq.q3, a: <HelpFaqAnswer html={h.faq.a3} /> },
          { q: h.faq.q4, a: <HelpFaqAnswer html={h.faq.a4} /> },
        ]}
      />

      <HelpSeeAlso slugs={['money', 'payroll']} />
    </HelpShell>
  );
}
