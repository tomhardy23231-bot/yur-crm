import {
  Briefcase,
  CalendarClock,
  Coins,
  GitBranch,
  Rocket,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// Реестр разделов многостраничной справки (/help/<slug>). Порядок массива =
// порядок чтения «как книга»: он задаёт сетку карточек на хабе и навигацию
// «назад/далее» внизу каждой страницы. Названия и лиды — в словаре helpNav.
// ============================================================================

export type HelpSectionSlug =
  | 'start'
  | 'cases'
  | 'stages'
  | 'clients'
  | 'tasks'
  | 'money'
  | 'payroll'
  | 'roles';

export const HELP_SECTIONS: ReadonlyArray<{
  slug: HelpSectionSlug;
  icon: LucideIcon;
  /** Пара токенов тинт-плитки (bg + text), как на карточках хаба. */
  tone: string;
}> = [
  { slug: 'start', icon: Rocket, tone: 'bg-primary-subtle text-primary' },
  { slug: 'cases', icon: Briefcase, tone: 'bg-info-bg text-info' },
  { slug: 'stages', icon: GitBranch, tone: 'bg-stage-consultation-bg text-stage-consultation' },
  { slug: 'clients', icon: Users, tone: 'bg-cat-document-bg text-cat-document' },
  { slug: 'tasks', icon: CalendarClock, tone: 'bg-warning-bg text-warning' },
  { slug: 'money', icon: Wallet, tone: 'bg-success-bg text-success' },
  { slug: 'payroll', icon: Coins, tone: 'bg-cat-representation-bg text-cat-representation' },
  { slug: 'roles', icon: ShieldCheck, tone: 'bg-stage-awaiting-bg text-stage-awaiting' },
];

export function getHelpSection(slug: HelpSectionSlug) {
  const section = HELP_SECTIONS.find((s) => s.slug === slug);
  if (!section) throw new Error(`Unknown help section: ${slug}`);
  return section;
}

/** Соседние разделы для навигации «назад / далее» внизу страницы. */
export function getHelpSectionNav(slug: HelpSectionSlug): {
  prev: HelpSectionSlug | null;
  next: HelpSectionSlug | null;
} {
  const i = HELP_SECTIONS.findIndex((s) => s.slug === slug);
  return {
    prev: HELP_SECTIONS[i - 1]?.slug ?? null,
    next: HELP_SECTIONS[i + 1]?.slug ?? null,
  };
}
