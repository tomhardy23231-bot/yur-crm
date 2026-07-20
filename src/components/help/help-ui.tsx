import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Lightbulb,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import {
  getHelpSection,
  getHelpSectionNav,
  type HelpSectionSlug,
} from '@/lib/help/sections';

// ============================================================================
// Строительные блоки многостраничной справки: обёртка страницы раздела
// (хлебная крошка, шапка, навигация «назад/далее»), секции, плашки-подсказки,
// пошаговые списки, FAQ и рамка «мини-скриншота» для иллюстраций.
// Все компоненты серверные — чистая разметка без интерактивности.
// ============================================================================

/** Обёртка страницы раздела: крошка, шапка с иконкой, контент, prev/next. */
export async function HelpShell({
  slug,
  children,
}: {
  slug: HelpSectionSlug;
  children: React.ReactNode;
}) {
  const { t } = await getT();
  const section = getHelpSection(slug);
  const { prev, next } = getHelpSectionNav(slug);
  const Icon = section.icon;
  const nav = t.helpNav;

  return (
    <main className="flex flex-col gap-7 px-3 py-2 sm:px-4">
      {/* Хлебная крошка */}
      <Link
        href="/help"
        className="inline-flex w-fit items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
        {nav.backToHub}
      </Link>

      {/* Шапка раздела */}
      <header className="flex items-start gap-4">
        <span
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${section.tone}`}
        >
          <Icon size={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-text">
            {nav.sections[slug].title}
          </h1>
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-text-muted">
            {nav.sections[slug].lead}
          </p>
        </div>
      </header>

      {children}

      {/* Навигация по разделам «как книга» */}
      <nav className="grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/help/${prev}`}
            className="group flex items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary-border hover:bg-primary-softer"
          >
            <ArrowLeft
              size={17}
              strokeWidth={2}
              className="shrink-0 text-text-subtle transition-colors group-hover:text-primary"
            />
            <span className="min-w-0">
              <span className="block text-[11.5px] font-medium uppercase tracking-[0.05em] text-text-subtle">
                {nav.prevLabel}
              </span>
              <span className="block truncate text-[14px] font-semibold text-text">
                {nav.sections[prev].title}
              </span>
            </span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {next && (
          <Link
            href={`/help/${next}`}
            className="group flex items-center justify-end gap-3 rounded-card border border-border bg-surface p-4 text-right transition-colors hover:border-primary-border hover:bg-primary-softer sm:col-start-2"
          >
            <span className="min-w-0">
              <span className="block text-[11.5px] font-medium uppercase tracking-[0.05em] text-text-subtle">
                {nav.nextLabel}
              </span>
              <span className="block truncate text-[14px] font-semibold text-text">
                {nav.sections[next].title}
              </span>
            </span>
            <ArrowRight
              size={17}
              strokeWidth={2}
              className="shrink-0 text-text-subtle transition-colors group-hover:text-primary"
            />
          </Link>
        )}
      </nav>
    </main>
  );
}

/** Секция раздела с заголовком (и необязательной мета-подписью справа). */
export function HelpSection({
  title,
  meta,
  children,
}: {
  title: string;
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

/** Абзац основного текста раздела. Понимает <b>-разметку из словаря. */
export function HelpText({ html }: { html: string }) {
  return (
    <p
      className="max-w-3xl text-[13.5px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CALLOUT_TONES = {
  tip: {
    icon: Lightbulb,
    frame: 'border-primary-border bg-primary-subtle text-primary-pressed',
  },
  warning: {
    icon: AlertTriangle,
    frame: 'border-warning/30 bg-warning-bg text-warning-text',
  },
  success: {
    icon: CheckCircle2,
    frame: 'border-success/30 bg-success-bg text-success-text',
  },
} as const;

/** Плашка «обратите внимание»: tip (синяя), warning (жёлтая), success (зелёная). */
export function HelpCallout({
  tone = 'tip',
  title,
  html,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  title?: string;
  html: string;
}) {
  const { icon: Icon, frame } = CALLOUT_TONES[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${frame}`}>
      <Icon size={17} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-relaxed">
        {title && <span className="mr-1 font-bold">{title}</span>}
        <span
          className="[&_b]:font-semibold"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

/** Карточка с нумерованными шагами. Строки понимают <b>-разметку. */
export function HelpSteps({
  icon: Icon,
  title,
  steps,
}: {
  icon?: LucideIcon;
  title?: string;
  steps: string[];
}) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      {title && (
        <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-text">
          {Icon && (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Icon size={17} strokeWidth={1.75} />
            </span>
          )}
          {title}
        </h3>
      )}
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

/**
 * Рамка «мини-скриншота»: стилизованное окно приложения с точками-светофором
 * в шапке. Внутрь кладётся нарисованная токенами иллюстрация — она не устаревает
 * при изменении интерфейса и переводится вместе со словарём.
 */
export function HelpShot({
  caption,
  children,
}: {
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted px-3.5 py-2" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-error/40" />
        <span className="h-2 w-2 rounded-full bg-warning/40" />
        <span className="h-2 w-2 rounded-full bg-success/40" />
      </div>
      <div className="bg-bg p-4">{children}</div>
      {caption && (
        <figcaption className="border-t border-border px-4 py-2.5 text-[12.5px] text-text-subtle">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** FAQ-аккордеон раздела (тот же рисунок, что на хабе справки). */
export function HelpFaq({
  title,
  countLabel,
  items,
}: {
  title: string;
  countLabel: string;
  items: ReadonlyArray<{ q: string; a: React.ReactNode }>;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-text">
          <MessageCircle size={16} strokeWidth={2} className="text-text-muted" aria-hidden="true" />
          {title}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-[11.5px] font-semibold text-primary-pressed">
          <span className="font-mono tabular-nums">{items.length}</span>
          {countLabel}
        </span>
      </header>
      {items.map((f, i) => (
        <details
          key={f.q}
          className={`group ${i < items.length - 1 ? 'border-b border-border' : ''}`}
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
          <div className="px-5 pb-4 pt-0 text-[13.5px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text">
            {f.a}
          </div>
        </details>
      ))}
    </Card>
  );
}

/** Ответ FAQ из словарной строки с <b>-разметкой. */
export function HelpFaqAnswer({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Клавиша-подсказка. */
export function HelpKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
      {children}
    </kbd>
  );
}

/** Ссылка-карточка «читать также» на другой раздел справки. */
export async function HelpSeeAlso({ slugs }: { slugs: HelpSectionSlug[] }) {
  const { t } = await getT();
  const nav = t.helpNav;
  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted">
        <BookOpen size={14} strokeWidth={2} aria-hidden="true" />
        {nav.seeAlso}
      </span>
      <div className="flex flex-wrap gap-2">
        {slugs.map((s) => (
          <Link
            key={s}
            href={`/help/${s}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text transition-colors hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed"
          >
            {nav.sections[s].title}
            <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
