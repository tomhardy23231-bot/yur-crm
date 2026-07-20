import { ArrowRight, Check } from 'lucide-react';

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
import type { CaseStage } from '@/lib/types/db';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpStages.metaTitle };
}

// ============================================================================
// Справка «Этапы дела»: воронка, смена этапа, откат офисом, «не заключили»,
// завершение и акт, архив, сигнал «зависло».
// ============================================================================

const STAGES: ReadonlyArray<{ stage: CaseStage; varName: string }> = [
  { stage: 'new_request', varName: '--stage-new' },
  { stage: 'consultation', varName: '--stage-consultation' },
  { stage: 'in_progress', varName: '--stage-in-progress' },
  { stage: 'awaiting_decision', varName: '--stage-awaiting' },
  { stage: 'closed', varName: '--stage-closed' },
];

export default async function HelpStagesPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpStages;

  return (
    <HelpShell slug="stages">
      {/* ── Воронка ────────────────────────────────────────────── */}
      <HelpSection title={h.funnel.title}>
        <HelpText html={h.funnel.text1} />
        <HelpShot caption={h.funnel.shotCaption}>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-1">
            {STAGES.map((s, i) => (
              <div key={s.stage} className="flex flex-1 items-center gap-1">
                <div
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center"
                  style={{ background: `var(${s.varName}-bg)` }}
                >
                  <span
                    className="text-[12.5px] font-bold leading-tight"
                    style={{ color: `var(${s.varName})` }}
                  >
                    {t.enums.caseStage[s.stage]}
                  </span>
                  <span className="text-[11px] leading-tight text-text-muted">
                    {h.funnel.stageNotes[s.stage]}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <ArrowRight
                    size={15}
                    strokeWidth={2}
                    className="hidden shrink-0 text-text-subtle sm:block"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Смена этапа ────────────────────────────────────────── */}
      <HelpSection title={h.move.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.move.text1} />
          <HelpText html={h.move.text2} />
        </div>
        <HelpShot caption={h.move.shotCaption}>
          <div className="mx-auto flex max-w-sm flex-col gap-1.5">
            {STAGES.map((s, i) => {
              const state =
                i < 2 ? 'done' : i === 2 ? 'current' : i === 3 ? 'next' : 'locked';
              return (
                <div
                  key={s.stage}
                  className={`flex items-center justify-between gap-3 rounded-full border px-3.5 py-2 ${
                    state === 'locked' ? 'opacity-45' : ''
                  } ${
                    state === 'current'
                      ? 'border-transparent'
                      : 'border-border bg-surface'
                  }`}
                  style={
                    state === 'current'
                      ? { background: `var(${s.varName}-bg)` }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    {state === 'done' && (
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        className="text-success"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className="text-[12.5px] font-semibold"
                      style={{
                        color:
                          state === 'current' ? `var(${s.varName})` : 'var(--text)',
                      }}
                    >
                      {t.enums.caseStage[s.stage]}
                    </span>
                  </span>
                  <span className="text-[11px] text-text-subtle">
                    {state === 'done'
                      ? h.move.shotDone
                      : state === 'current'
                        ? h.move.shotCurrent
                        : state === 'next'
                          ? h.move.shotNext
                          : h.move.shotLocked}
                  </span>
                </div>
              );
            })}
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Откат ──────────────────────────────────────────────── */}
      <HelpSection title={h.rollback.title}>
        <HelpText html={h.rollback.text1} />
        <HelpCallout tone="success" html={h.rollback.dbNote} />
      </HelpSection>

      {/* ── «Не заключили» ─────────────────────────────────────── */}
      <HelpSection title={h.lost.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.lost.text1} />
          <HelpText html={h.lost.text2} />
        </div>
        <HelpShot caption={h.lost.shotCaption}>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
                style={{
                  background: 'var(--stage-closed-bg)',
                  color: 'var(--stage-closed)',
                }}
              >
                {t.enums.caseStage.closed}
              </span>
              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11.5px] font-bold text-text-muted">
                {h.lost.shotBadge}
              </span>
            </div>
            <span className="text-[12.5px] text-text-muted">{h.lost.shotReason}</span>
          </div>
        </HelpShot>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.lost.warn} />
      </HelpSection>

      {/* ── Завершение и акт ───────────────────────────────────── */}
      <HelpSection title={h.closing.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.closing.text1} />
          <HelpText html={h.closing.text2} />
        </div>
      </HelpSection>

      {/* ── Архив ──────────────────────────────────────────────── */}
      <HelpSection title={h.archive.title}>
        <HelpText html={h.archive.text1} />
      </HelpSection>

      {/* ── «Зависло» ──────────────────────────────────────────── */}
      <HelpSection title={h.stale.title}>
        <HelpText html={h.stale.text1} />
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

      <HelpSeeAlso slugs={['cases', 'money']} />
    </HelpShell>
  );
}
