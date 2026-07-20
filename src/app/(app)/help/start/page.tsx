import { Bell, Briefcase, CalendarClock, Search, UserPlus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import {
  HelpCallout,
  HelpFaq,
  HelpFaqAnswer,
  HelpKbd,
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
  return { title: t.helpStart.metaTitle };
}

// ============================================================================
// Справка «С чего начать»: первый вход, устройство экрана, поиск и хоткеи,
// колокольчик, первые шаги (клиент → дело → задача), дашборд, обучение.
// ============================================================================

export default async function HelpStartPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpStart;

  return (
    <HelpShell slug="start">
      {/* ── Первый вход ────────────────────────────────────────── */}
      <HelpSection title={h.firstLogin.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.firstLogin.text1} />
          <HelpText html={h.firstLogin.text2} />
        </div>
        <HelpCallout tone="tip" html={h.firstLogin.tip} />
      </HelpSection>

      {/* ── Устройство экрана ──────────────────────────────────── */}
      <HelpSection title={h.screen.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.screen.text1} />
          <HelpText html={h.screen.text2} />
          <HelpText html={h.screen.text3} />
        </div>
        <HelpShot caption={h.screen.shotCaption}>
          <div className="flex gap-3">
            {/* Мини-сайдбар */}
            <div
              className="flex w-24 shrink-0 flex-col gap-1 rounded-xl p-2"
              style={{ background: 'var(--sidebar-bg)' }}
            >
              <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[12px] font-bold text-white">
                Ю
              </span>
              {h.screen.shotSidebar.map((item, i) => (
                <span
                  key={item}
                  className={`rounded-md px-2 py-1 text-center text-[10.5px] font-medium ${
                    i === 0 ? 'bg-white/15 text-white' : 'text-white/60'
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
            {/* Топбар + рабочая зона */}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11.5px] text-text-subtle">
                  <Search size={12} strokeWidth={2} aria-hidden="true" />
                  <span className="truncate">{h.screen.shotSearch}</span>
                  <kbd className="ml-auto shrink-0 rounded border border-border bg-surface-sunken px-1 font-mono text-[9px] font-semibold uppercase text-text-subtle">
                    Ctrl K
                  </kbd>
                </span>
                <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-white">
                  {h.screen.shotNewCase}
                </span>
                <span className="relative shrink-0 text-text-muted">
                  <Bell size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-error" />
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-[12px] text-text-subtle">
                {h.screen.shotWorkArea}
              </div>
            </div>
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Поиск и хоткеи ─────────────────────────────────────── */}
      <HelpSection title={h.search.title}>
        <HelpText html={h.search.text1} />
        <Card className="p-5">
          <h3 className="mb-3 text-[13px] font-extrabold text-text-muted">
            {h.search.hotkeysTitle}
          </h3>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {h.search.hotkeys.map((row) => (
              <div
                key={row.keys}
                className="flex items-center justify-between gap-4 border-b border-border pb-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <span className="text-[13.5px] text-text">{row.label}</span>
                <HelpKbd>{row.keys}</HelpKbd>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-text-subtle">{h.search.note}</p>
        </Card>
      </HelpSection>

      {/* ── Колокольчик ────────────────────────────────────────── */}
      <HelpSection title={h.bell.title}>
        <HelpText html={h.bell.text1} />
        <HelpCallout tone="tip" html={h.bell.note} />
      </HelpSection>

      {/* ── Первые шаги ────────────────────────────────────────── */}
      <HelpSection title={h.steps.title}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <HelpSteps icon={UserPlus} title={h.steps.clientTitle} steps={h.steps.clientSteps} />
          <HelpSteps icon={Briefcase} title={h.steps.caseTitle} steps={h.steps.caseSteps} />
          <HelpSteps icon={CalendarClock} title={h.steps.taskTitle} steps={h.steps.taskSteps} />
        </div>
      </HelpSection>

      {/* ── Дашборд ────────────────────────────────────────────── */}
      <HelpSection title={h.dashboard.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.dashboard.text1} />
          <HelpText html={h.dashboard.text2} />
        </div>
      </HelpSection>

      {/* ── Обучение ───────────────────────────────────────────── */}
      <HelpSection title={h.learn.title}>
        <HelpText html={h.learn.text1} />
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

      <HelpSeeAlso slugs={['cases', 'roles']} />
    </HelpShell>
  );
}
