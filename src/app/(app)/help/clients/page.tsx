import { AlertTriangle } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
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
  return { title: t.helpClients.metaTitle };
}

// ============================================================================
// Справка «Клиенты»: список, типы и реквизиты, источник, конфликт-чек,
// карточка, права, видимость.
// ============================================================================

export default async function HelpClientsPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpClients;

  return (
    <HelpShell slug="clients">
      <HelpText html={h.intro} />

      {/* ── Список ─────────────────────────────────────────────── */}
      <HelpSection title={h.list.title}>
        <HelpText html={h.list.text1} />
      </HelpSection>

      {/* ── Типы и реквизиты ───────────────────────────────────── */}
      <HelpSection title={h.types.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.types.text1} />
          <HelpText html={h.types.text2} />
        </div>
      </HelpSection>

      {/* ── Источник ───────────────────────────────────────────── */}
      <HelpSection title={h.source.title}>
        <HelpText html={h.source.text1} />
      </HelpSection>

      {/* ── Конфликт-чек ───────────────────────────────────────── */}
      <HelpSection title={h.conflict.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.conflict.text1} />
          <HelpText html={h.conflict.text2} />
        </div>
        <HelpShot caption={h.conflict.shotCaption}>
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3">
            <AlertTriangle
              size={17}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div className="min-w-0 text-[13px] leading-relaxed text-warning-text">
              <span className="font-bold">{h.conflict.shotWarn}</span>
              <span className="mt-1 block rounded-lg bg-surface px-3 py-2 text-[12.5px] text-text">
                {h.conflict.shotMatch}
              </span>
            </div>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Карточка ───────────────────────────────────────────── */}
      <HelpSection title={h.card.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.card.text1} />
          <HelpText html={h.card.text2} />
        </div>
        <HelpShot caption={h.card.shotCaption}>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={h.card.shotName} size="lg" />
              <div className="min-w-0">
                <span className="block text-[14px] font-bold text-text">
                  {h.card.shotName}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
                  <span className="rounded-full bg-primary-subtle px-2 py-0.5 font-semibold text-primary-pressed">
                    {h.card.shotKind}
                  </span>
                  {h.card.shotSince}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
              {[
                [h.card.shotCases, h.card.shotCasesVal, 'text-text'],
                [h.card.shotSum, h.card.shotSumVal, 'text-text'],
                [h.card.shotDebt, h.card.shotDebtVal, 'text-error'],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-xl bg-surface-sunken px-3 py-2">
                  <span className="block text-[11px] text-text-muted">{label}</span>
                  <span className={`block text-[14px] font-bold tabular-nums ${cls}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Права ──────────────────────────────────────────────── */}
      <HelpSection title={h.rights.title}>
        <HelpText html={h.rights.text1} />
        <HelpCallout tone="success" html={h.rights.guard} />
      </HelpSection>

      {/* ── Видимость ──────────────────────────────────────────── */}
      <HelpSection title={h.visibility.title}>
        <HelpText html={h.visibility.text1} />
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
        ]}
      />

      <HelpSeeAlso slugs={['cases', 'start']} />
    </HelpShell>
  );
}
