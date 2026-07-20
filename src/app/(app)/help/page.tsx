import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ChevronDown,
  Coins,
  Eye,
  FileText,
  GitBranch,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { HelpActions } from '@/components/onboarding/help-actions';
import { requireUser } from '@/lib/auth/require-role';
import { STAFF_ROLES, type CaseStage } from '@/lib/types/db';
import { getT } from '@/lib/i18n/server';
import { HELP_SECTIONS } from '@/lib/help/sections';
import { getPayrollRates } from '@/lib/payroll/queries';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.help.metaTitle };
}

// ============================================================================
// Страница «Справка»: подробное описание системы, правила работы с примерами и
// «скриншото-подобными» иллюстрациями, пошаговые инструкции, FAQ и перезапуск
// обучающего тура. Видна всем сотрудникам.
// ============================================================================

const STAGES: ReadonlyArray<{ stage: CaseStage; varName: string }> = [
  { stage: 'new_request', varName: '--stage-new' },
  { stage: 'consultation', varName: '--stage-consultation' },
  { stage: 'in_progress', varName: '--stage-in-progress' },
  { stage: 'awaiting_decision', varName: '--stage-awaiting' },
  { stage: 'closed', varName: '--stage-closed' },
];

type Faq = { q: string; a: React.ReactNode };

export default async function HelpPage() {
  const user = await requireUser();
  const { t } = await getT();
  const isStaff = STAFF_ROLES.includes(user.profile.role);
  const h = t.help;

  const visibility = isStaff
    ? h.page.visibilityStaff
    : user.profile.role === 'lawyer'
      ? h.page.visibilityLawyer
      : h.page.visibilityExpert;

  const roles: ReadonlyArray<{ name: string; tone: string; sees: string }> = [
    { name: t.enums.role.owner, tone: 'var(--info)', sees: h.roleSees.owner },
    { name: t.enums.role.admin, tone: 'var(--stage-awaiting)', sees: h.roleSees.admin },
    { name: t.enums.role.office_manager, tone: 'var(--primary)', sees: h.roleSees.office_manager },
    { name: t.enums.role.lawyer, tone: 'var(--cat-claim)', sees: h.roleSees.lawyer },
    { name: t.enums.role.expert, tone: 'var(--success)', sees: h.roleSees.expert },
  ];

  // Живые ставки компании (payroll_rates); фолбэк — дефолты из словаря.
  const liveRates = await getPayrollRates();
  const pctFor = (category: string, fallback: string): string => {
    const r = liveRates.find((x) => x.category === category);
    if (!r) return fallback;
    const l = Number(r.lawyer_percent);
    const e = Number(r.expert_percent);
    return l === e ? `${l}%` : `${l}% / ${e}%`;
  };
  const rates: ReadonlyArray<{ cat: string; pct: string; varName: string }> = [
    { cat: t.enums.caseCategory.document, pct: pctFor('document', h.payroll.rateDocument), varName: '--cat-document' },
    { cat: t.enums.caseCategory.claim, pct: pctFor('claim', h.payroll.rateClaim), varName: '--cat-claim' },
    { cat: t.enums.caseCategory.representation, pct: pctFor('representation', h.payroll.rateRepresentation), varName: '--cat-representation' },
  ];

  const faqs: Faq[] = [
    {
      q: h.faq.createCaseQ,
      a: (
        <>
          {h.faq.createCaseA1} <b>{h.faq.createCaseA2}</b> {h.faq.createCaseA3}{' '}
          <b>{h.faq.createCaseA4}</b>
          {h.faq.createCaseA5}
        </>
      ),
    },
    {
      q: h.faq.visibilityQ,
      a: (
        <>
          {visibility} {h.faq.visibilityA}
        </>
      ),
    },
    {
      q: h.faq.payrollQ,
      a: (
        <>
          {h.faq.payrollA1} <b>{h.faq.payrollA2}</b> {h.faq.payrollA3}{' '}
          <b>{h.faq.payrollA4}</b>.
        </>
      ),
    },
    {
      q: h.faq.stagesQ,
      a: <>{h.faq.stagesA}</>,
    },
    {
      q: h.faq.documentQ,
      a: (
        <>
          {h.faq.documentA1} <b>{h.faq.documentA2}</b> {h.faq.documentA3}
        </>
      ),
    },
    {
      q: h.faq.paymentQ,
      a: (
        <>
          {h.faq.paymentA1} <b>{h.faq.paymentA2}</b>
          {h.faq.paymentA3}
        </>
      ),
    },
    {
      q: h.faq.searchQ,
      a: (
        <>
          {h.faq.searchA1} <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> {h.faq.searchA2}
        </>
      ),
    },
    {
      q: h.faq.actQ,
      a: <>{h.faq.actA}</>,
    },
    ...(isStaff
      ? [
          {
            q: h.faq.usersQ,
            a: (
              <>
                {h.faq.usersA1} <b>{h.faq.usersA2}</b> {h.faq.usersA3}
              </>
            ),
          },
        ]
      : []),
  ];

  // У каждого раздела — свой цвет тинт-плитки (токенами, без hex).
  const hotkeyRows: ReadonlyArray<{ keys: string; label: string }> = [
    { keys: 'Ctrl K', label: t.ui.hotkeys.searchAction },
    { keys: '/', label: t.ui.hotkeys.searchAction },
    ...(user.caps.create_cases
      ? [{ keys: 'N', label: t.ui.hotkeys.newCaseAction }]
      : []),
    { keys: 'T', label: t.ui.hotkeys.newTaskAction },
    { keys: '?', label: t.ui.hotkeys.helpAction },
    { keys: 'Esc', label: t.ui.hotkeys.closeAction },
  ];

  const principles: ReadonlyArray<{
    icon: LucideIcon;
    title: string;
    text: string;
    tone: string;
  }> = [
    {
      icon: Briefcase,
      title: h.principles.caseCenterTitle,
      text: h.principles.caseCenterText,
      tone: 'bg-primary-subtle text-primary',
    },
    {
      icon: GitBranch,
      title: h.principles.funnelTitle,
      text: h.principles.funnelText,
      tone: 'bg-stage-consultation-bg text-stage-consultation',
    },
    {
      icon: Coins,
      title: h.principles.payrollTitle,
      text: h.principles.payrollText,
      tone: 'bg-success-bg text-success',
    },
    {
      icon: ShieldCheck,
      title: h.principles.accessTitle,
      text: h.principles.accessText,
      tone: 'bg-info-bg text-info',
    },
  ];

  return (
    <main className="flex flex-col gap-7 px-3 py-2 sm:px-4">
      {/* ── Hero (фирменный баннер — как на дашборде) ──────────── */}
      <section
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
        style={{ background: 'var(--grad-hero)' }}
      >
        {/* Декоративные размытые орбы */}
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ background: 'rgba(255,255,255,0.45)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-32 h-56 w-56 rounded-full opacity-30 blur-3xl"
          style={{ background: 'var(--primary-bright)' }}
          aria-hidden="true"
        />
        {/* Тонкая сетка-узор */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-semibold text-white backdrop-blur-sm">
              <Sparkles size={12} strokeWidth={2.5} aria-hidden="true" />
              {h.page.heroBadge}
            </span>
            <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-white">
              {h.page.heroTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-white/85">
              {h.page.heroLead}
            </p>
          </div>
          <HelpActions />
        </div>
      </section>

      {/* ── Разделы многостраничной справки ────────────────────── */}
      <Section
        title={t.helpNav.sectionsTitle}
        meta={<span className="hidden sm:inline">{t.helpNav.sectionsLead}</span>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {HELP_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.slug} href={`/help/${s.slug}`} className="group">
                <Card className="flex h-full flex-col gap-2.5 p-5 transition-colors group-hover:border-primary-border group-hover:bg-primary-softer">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <h3 className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-text">
                    {t.helpNav.sections[s.slug].title}
                    <ArrowRight
                      size={14}
                      strokeWidth={2.2}
                      className="text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </h3>
                  <p className="text-[13px] leading-relaxed text-text-muted">
                    {t.helpNav.sections[s.slug].lead}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ── Ключевые принципы ─────────────────────────────────── */}
      <Section title={h.sections.howItWorks}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {principles.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="flex flex-col gap-2.5 p-5">
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${p.tone}`}
                >
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="text-[15px] font-semibold text-text">{p.title}</h3>
                <p className="text-[13px] leading-relaxed text-text-muted">{p.text}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ── Воронка из 5 этапов (визуальный пример) ────────────── */}
      <Section title={h.sections.casePath}>
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          {/* Иллюстрация-степпер (как в карточке дела) */}
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
                    {h.stageNotes[s.stage]}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <ArrowRight
                    size={15}
                    strokeWidth={2}
                    className="hidden shrink-0 text-text-subtle sm:block"
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            {h.stageHint}
          </p>
        </Card>
      </Section>

      {/* ── Роли и доступ (пример: кто что видит) ──────────────── */}
      <Section title={h.sections.whoSeesWhat}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {roles.map((r) => (
            <Card key={r.name} className="flex items-start gap-3.5 p-4">
              <span
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: r.tone }}
                aria-hidden="true"
              >
                <Eye size={17} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-text">{r.name}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">{r.sees}</p>
              </div>
            </Card>
          ))}
        </div>
        <Callout>
          {visibility} {h.rolesCallout}
        </Callout>
      </Section>

      {/* ── Зарплата: формула + живой пример ───────────────────── */}
      <Section title={h.sections.payroll}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Ставки по категориям */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[13px] font-extrabold text-text-muted">
              {h.payroll.ratesTitle}
            </h3>
            <div className="flex flex-col gap-2">
              {rates.map((r) => (
                <div
                  key={r.cat}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                  style={{ background: `var(${r.varName}-bg)` }}
                >
                  <span className="text-[14px] font-semibold" style={{ color: `var(${r.varName})` }}>
                    {r.cat}
                  </span>
                  <span
                    className="text-[18px] font-extrabold tabular-nums"
                    style={{ color: `var(${r.varName})` }}
                  >
                    {r.pct}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* «Скриншото-подобный» пример расчёта */}
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-[13px] font-extrabold text-text-muted">
              {h.payroll.exampleTitle}
            </h3>
            <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 font-semibold text-cat-claim">
                  {h.payroll.exampleBadge}
                </span>
                <span className="text-text-muted">{h.payroll.exampleCaseLabel}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums">
                <span className="text-text-muted">
                  {h.payroll.exampleSum}{' '}
                  <span className="font-bold text-text">{h.payroll.exampleSumValue}</span>
                </span>
                <span className="text-text-muted">
                  {h.payroll.examplePaid}{' '}
                  <span className="font-bold text-success">{h.payroll.examplePaidValue}</span>
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <PayRow
                  role={h.payroll.exampleRoleLawyer}
                  base={h.payroll.exampleBase}
                  amount={h.payroll.exampleAmount}
                />
                <PayRow
                  role={h.payroll.exampleRoleExpert}
                  base={h.payroll.exampleBase}
                  amount={h.payroll.exampleAmount}
                />
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-text-muted">
              {h.payroll.note}
            </p>
          </Card>
        </div>
      </Section>

      {/* ── Пошагово: завести клиента / создать дело ───────────── */}
      <Section title={h.sections.getStarted}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Steps
            icon={UserPlus}
            title={h.start.clientTitle}
            steps={[
              h.start.clientStep1,
              h.start.clientStep2,
              h.start.clientStep3,
              h.start.clientStep4,
            ]}
          />
          <Steps
            icon={Briefcase}
            title={h.start.caseTitle}
            steps={[
              h.start.caseStep1,
              h.start.caseStep2,
              h.start.caseStep3,
              h.start.caseStep4,
              h.start.caseStep5,
            ]}
          />
        </div>
      </Section>

      {/* ── Документы / Платежи / Сроки ────────────────────────── */}
      <Section title={h.sections.insideCase}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniCard
            icon={FileText}
            title={h.inside.documentsTitle}
            text={h.inside.documentsText}
            tone="bg-cat-document-bg text-cat-document"
          />
          <MiniCard
            icon={Wallet}
            title={h.inside.paymentsTitle}
            text={h.inside.paymentsText}
            tone="bg-success-bg text-success"
          />
          <MiniCard
            icon={CalendarClock}
            title={h.inside.tasksTitle}
            text={h.inside.tasksText}
            tone="bg-warning-bg text-warning"
          />
        </div>
      </Section>

      {/* ── Горячие клавиши (v3 Сессия 11) ─────────────────────── */}
      <Section
        title={h.sections.hotkeys}
        meta={
          <>
            <span className="font-mono tabular-nums">{hotkeyRows.length}</span>{' '}
            {h.sections.hotkeysMeta}
          </>
        }
      >
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {hotkeyRows.map((row) => (
              <div
                key={row.keys + row.label}
                className="flex items-center justify-between gap-4 border-b border-border pb-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
              >
                <span className="text-[13.5px] text-text">{row.label}</span>
                <kbd className="shrink-0 rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
                  {row.keys}
                </kbd>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-text-subtle">{t.ui.hotkeys.hint}</p>
        </Card>
      </Section>

      {/* ── FAQ (SectionCard: заголовок живёт в шапке карточки) ── */}
      <section className="flex flex-col gap-3">
        <Card className="overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold text-text">{h.sections.faq}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-[11.5px] font-semibold text-primary-pressed">
              <MessageCircle size={12} strokeWidth={2.4} aria-hidden="true" />
              <span className="font-mono tabular-nums">{faqs.length}</span>
              {h.faq.countLabel}
            </span>
          </header>
          {faqs.map((f, i) => (
            <details
              key={f.q}
              className={`group ${i < faqs.length - 1 ? 'border-b border-border' : ''}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[14px] font-semibold text-text transition-colors hover:bg-primary-softer">
                {f.q}
                <ChevronDown
                  size={18}
                  strokeWidth={2.2}
                  className="shrink-0 text-text-subtle transition-transform duration-200 group-open:rotate-180 group-open:text-primary-pressed"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-5 pb-4 pt-0 text-[13.5px] leading-relaxed text-text-muted">
                {f.a}
              </div>
            </details>
          ))}
        </Card>
        <p className="text-[12.5px] text-text-subtle">
          {h.faq.footer}
        </p>
      </section>
    </main>
  );
}

// ============================================================================
// Внутренние UI-частники страницы
// ============================================================================

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  /** Мета-подпись справа от заголовка (числа — font-mono tabular-nums). */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-text">{title}</h2>
        {meta && <span className="text-[12.5px] text-text-muted">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-primary-border bg-primary-subtle px-4 py-3 text-[13px] font-medium leading-relaxed text-primary-pressed">
      {children}
    </div>
  );
}

function PayRow({ role, base, amount }: { role: string; base: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-semibold text-text">{role}</span>
      <span className="text-[12px] text-text-subtle">{base}</span>
      <span className="ml-auto whitespace-nowrap rounded-md bg-success-bg px-2.5 py-1 text-[14px] font-bold tabular-nums text-success">
        {amount}
      </span>
    </div>
  );
}

function Steps({
  icon: Icon,
  title,
  steps,
}: {
  icon: LucideIcon;
  title: string;
  // Строки содержат разметку <b> — рендерятся через dangerouslySetInnerHTML.
  steps: string[];
}) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-text">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <Icon size={17} strokeWidth={1.75} />
        </span>
        {title}
      </h3>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
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
  );
}

function MiniCard({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Пара токенов тинт-плитки, например 'bg-success-bg text-success'. */
  tone: string;
}) {
  return (
    <Card className="flex flex-col gap-2.5 p-5">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <h3 className="text-[15px] font-semibold text-text">{title}</h3>
      <p className="text-[13px] leading-relaxed text-text-muted">{text}</p>
    </Card>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
      {children}
    </kbd>
  );
}
