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

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpCases.metaTitle };
}

// ============================================================================
// Справка «Дела»: список, доска, создание, карточка со вкладками,
// inline-правки, документы/комментарии, видимость. Этапы — в разделе stages.
// ============================================================================

export default async function HelpCasesPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpCases;

  return (
    <HelpShell slug="cases">
      <HelpText html={h.intro} />

      {/* ── Список ─────────────────────────────────────────────── */}
      <HelpSection title={h.list.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.list.text1} />
          <HelpText html={h.list.text2} />
          <HelpText html={h.list.text3} />
        </div>
        <HelpShot caption={h.list.shotCaption}>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-text">
                {h.list.shotCase}
              </span>
              <span className="block truncate text-[11.5px] text-text-muted">
                {h.list.shotClient}
              </span>
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <span className="rounded-full bg-stage-in-progress-bg px-2.5 py-0.5 text-[11.5px] font-bold text-stage-in-progress">
                {h.list.shotStage}
              </span>
              <span className="text-[11px] font-semibold text-warning-text">
                {h.list.shotDays}
              </span>
            </div>
            <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 text-[11.5px] font-semibold text-cat-claim">
              {h.list.shotCat}
            </span>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[13px] font-bold tabular-nums text-text">
                {h.list.shotSum}
              </span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full w-3/5 rounded-full bg-success" />
              </span>
            </div>
            <span className="rounded-md bg-error-bg px-2 py-0.5 text-[12px] font-bold tabular-nums text-error-text">
              {h.list.shotDebt}
            </span>
          </div>
        </HelpShot>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.list.localNote} />
      </HelpSection>

      {/* ── Доска ──────────────────────────────────────────────── */}
      <HelpSection title={h.board.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.board.text1} />
          <HelpText html={h.board.text2} />
        </div>
      </HelpSection>

      {/* ── Создание ───────────────────────────────────────────── */}
      <HelpSection title={h.create.title}>
        <HelpText html={h.create.text1} />
        <Card className="p-5">
          <ol className="flex flex-col gap-2.5">
            {h.create.sections.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">
                  {i + 1}
                </span>
                <span
                  className="text-[13.5px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
                  dangerouslySetInnerHTML={{ __html: s }}
                />
              </li>
            ))}
          </ol>
        </Card>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.create.warn1} />
        <HelpCallout tone="tip" html={h.create.warn2} />
      </HelpSection>

      {/* ── Карточка ───────────────────────────────────────────── */}
      <HelpSection title={h.card.title}>
        <HelpText html={h.card.text1} />
        <HelpShot caption={h.card.shotCaption}>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-stage-in-progress-bg px-2.5 py-0.5 text-[11.5px] font-bold text-stage-in-progress">
                {h.card.shotStage}
              </span>
              <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 text-[11.5px] font-semibold text-cat-claim">
                {h.card.shotCat}
              </span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                {h.card.shotActions.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-primary-border bg-primary-subtle px-2.5 py-1 text-[11.5px] font-semibold text-primary-pressed"
                  >
                    {a}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] tabular-nums text-text-muted">
                {h.card.shotPaid}
              </span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full w-3/5 rounded-full bg-success" />
              </span>
            </div>
            <div className="flex flex-wrap gap-1 border-t border-border pt-2.5">
              {h.card.shotTabs.map((tab, i) => (
                <span
                  key={tab}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                    i === 0
                      ? 'bg-primary text-white'
                      : 'text-text-muted'
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>
        </HelpShot>
        <Card className="p-5">
          <ul className="flex flex-col gap-2.5">
            {h.card.tabs.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span
                  className="text-[13.5px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
                  dangerouslySetInnerHTML={{ __html: s }}
                />
              </li>
            ))}
          </ul>
        </Card>
      </HelpSection>

      {/* ── Inline-правки ──────────────────────────────────────── */}
      <HelpSection title={h.inline.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.inline.text1} />
          <HelpText html={h.inline.text2} />
        </div>
        <HelpCallout tone="success" html={h.inline.lockNote} />
      </HelpSection>

      {/* ── Документы и комментарии ────────────────────────────── */}
      <HelpSection title={h.docs.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.docs.text1} />
          <HelpText html={h.docs.text2} />
        </div>
      </HelpSection>

      {/* ── Видимость ──────────────────────────────────────────── */}
      <HelpSection title={h.visibility.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.visibility.text1} />
          <HelpText html={h.visibility.text2} />
        </div>
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

      <HelpSeeAlso slugs={['stages', 'money']} />
    </HelpShell>
  );
}
