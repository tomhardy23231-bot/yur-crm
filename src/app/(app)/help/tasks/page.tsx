import { Card } from '@/components/ui/card';
import {
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
  return { title: t.helpTasks.metaTitle };
}

// ============================================================================
// Справка «Задачи и календарь»: типы задач, способы создания, раздел задач,
// календарь с отсутствиями, колокольчик, Telegram и ICS-подписка.
// ============================================================================

const CHIP_STYLES = {
  task: { background: 'var(--primary-subtle)', color: 'var(--primary-pressed)' },
  hearing: { background: 'var(--error-bg)', color: 'var(--error-text)' },
  deadline: { background: 'var(--warning-bg)', color: 'var(--warning-text)' },
  absence: { background: 'var(--absence-bg)', color: 'var(--absence)' },
} as const;

export default async function HelpTasksPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpTasks;

  return (
    <HelpShell slug="tasks">
      <HelpText html={h.intro} />

      {/* ── Типы ───────────────────────────────────────────────── */}
      <HelpSection title={h.types.title}>
        <HelpText html={h.types.text1} />
        <HelpShot caption={h.types.shotCaption}>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
            <span className="h-5 w-5 shrink-0 rounded-full border-2 border-border" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-text">
              {h.types.shotTask}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
              style={CHIP_STYLES.task}
            >
              {h.types.shotType}
            </span>
            <span className="rounded-md bg-surface-sunken px-2 py-0.5 font-mono text-[11.5px] tabular-nums text-text-muted">
              {h.types.shotDue}
            </span>
            <span className="text-[11.5px] text-primary">{h.types.shotCase}</span>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Создание ───────────────────────────────────────────── */}
      <HelpSection title={h.create.title}>
        <Card className="p-5">
          <ol className="flex flex-col gap-2.5">
            {h.create.steps.map((s, i) => (
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
        <HelpText html={h.create.text1} />
      </HelpSection>

      {/* ── Раздел задач ───────────────────────────────────────── */}
      <HelpSection title={h.listPage.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.listPage.text1} />
          <HelpText html={h.listPage.text2} />
        </div>
      </HelpSection>

      {/* ── Календарь ──────────────────────────────────────────── */}
      <HelpSection title={h.calendar.title}>
        <HelpText html={h.calendar.text1} />
        <HelpShot caption={h.calendar.shotCaption}>
          <div className="grid grid-cols-5 gap-1.5">
            {h.calendar.shotDays.map((day, di) => (
              <div
                key={day}
                className="flex min-h-[92px] flex-col gap-1 rounded-lg border border-border bg-surface p-1.5"
              >
                <span className="text-[10.5px] font-semibold text-text-subtle">{day}</span>
                {h.calendar.shotChips
                  .filter((c) => c.day === di)
                  .map((c) => (
                    <span
                      key={c.label}
                      className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={CHIP_STYLES[c.kind as keyof typeof CHIP_STYLES]}
                    >
                      {c.label}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Отпуска ────────────────────────────────────────────── */}
      <HelpSection title={h.absences.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.absences.text1} />
          <HelpText html={h.absences.text2} />
        </div>
      </HelpSection>

      {/* ── Уведомления ────────────────────────────────────────── */}
      <HelpSection title={h.notifications.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.notifications.text1} />
          <HelpText html={h.notifications.text2} />
          <HelpText html={h.notifications.text3} />
        </div>
        <HelpShot caption={h.notifications.shotCaption}>
          <div
            className="mx-auto flex max-w-md flex-col gap-1.5 rounded-xl p-3.5"
            style={{ background: 'var(--sidebar-bg)' }}
          >
            <span className="text-[12.5px] font-bold text-white">
              {h.notifications.shotHeader}
            </span>
            {h.notifications.shotLines.map((line) => (
              <span
                key={line}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-[11.5px] leading-relaxed text-white/90"
              >
                {line}
              </span>
            ))}
          </div>
        </HelpShot>
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

      <HelpSeeAlso slugs={['start', 'cases']} />
    </HelpShell>
  );
}
