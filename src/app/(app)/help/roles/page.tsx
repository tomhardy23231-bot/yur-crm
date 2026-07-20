import { Crown, Eye, KeyRound, Lock } from 'lucide-react';

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
import {
  CAP_ROLE_DEFAULTS,
  OWNER_ONLY_CAPABILITIES,
  type Capability,
  type Role,
} from '@/lib/types/db';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.helpRoles.metaTitle };
}

// ============================================================================
// Справка «Роли и доступ»: лестница ролей, подразделения и охват видимости,
// 15 персональных прав (лейблы/подсказки — из enums, дефолты — из
// CAP_ROLE_DEFAULTS), правила выдачи, панель «Доступ и вход», FAQ.
// ============================================================================

// Порядок и группировка прав — как на карточке сотрудника (user-perms-toggles).
const CAP_GROUPS: ReadonlyArray<{
  key: 'cases' | 'finance' | 'admin';
  caps: readonly Capability[];
}> = [
  {
    key: 'cases',
    caps: [
      'view_all_cases',
      'create_cases',
      'delete_cases',
      'create_clients',
      'delete_clients',
      'delete_documents',
    ],
  },
  {
    key: 'finance',
    caps: [
      'edit_payments',
      'delete_payments',
      'view_all_payroll',
      'edit_rate_overrides',
      'view_cash',
      'can_manage_cash',
    ],
  },
  { key: 'admin', caps: ['create_users', 'manage_users', 'edit_payroll_rates'] },
];

const ROLE_TONES: Record<Role, string> = {
  owner: 'var(--info)',
  admin: 'var(--stage-awaiting)',
  office_manager: 'var(--primary)',
  lawyer: 'var(--cat-claim)',
  expert: 'var(--success)',
};

export default async function HelpRolesPage() {
  await requireUser();
  const { t } = await getT();
  const h = t.helpRoles;

  return (
    <HelpShell slug="roles">
      <div className="flex flex-col gap-2">
        <HelpText html={h.intro1} />
        <HelpText html={h.intro2} />
      </div>

      {/* ── Лестница ролей (иллюстрация) ───────────────────────── */}
      <HelpSection title={h.hierarchy.title}>
        <HelpShot caption={h.hierarchy.shotCaption}>
          <div className="mx-auto flex max-w-xl flex-col gap-2">
            <LadderRow
              tone={ROLE_TONES.owner}
              icon={<Crown size={14} strokeWidth={2.2} />}
              name={t.enums.role.owner}
              note={h.hierarchy.ownerNote}
              scope={h.hierarchy.companyLabel}
              width="100%"
            />
            <LadderRow
              tone={ROLE_TONES.admin}
              name={t.enums.role.admin}
              note={h.hierarchy.adminNote}
              scope={h.hierarchy.departmentLabel}
              width="86%"
            />
            <LadderRow
              tone={ROLE_TONES.office_manager}
              name={t.enums.role.office_manager}
              note={h.hierarchy.officeNote}
              scope={h.hierarchy.departmentLabel}
              width="72%"
            />
            <LadderRow
              tone={ROLE_TONES.lawyer}
              name={h.hierarchy.fieldLabel}
              note={h.hierarchy.fieldNote}
              scope={h.hierarchy.ownCasesLabel}
              width="58%"
            />
          </div>
        </HelpShot>
      </HelpSection>

      {/* ── Карточки ролей ─────────────────────────────────────── */}
      <HelpSection title={h.roleCards.title}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(
            [
              ['owner', h.roleCards.owner],
              ['admin', h.roleCards.admin],
              ['office_manager', h.roleCards.office_manager],
              ['lawyer', h.roleCards.lawyer],
              ['expert', h.roleCards.expert],
            ] as const
          ).map(([role, sees]) => (
            <Card key={role} className="flex items-start gap-3.5 p-4">
              <span
                className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: ROLE_TONES[role] }}
                aria-hidden="true"
              >
                <Eye size={17} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-text">
                  {t.enums.role[role]}
                </h3>
                <p
                  className="mt-0.5 text-[13px] leading-relaxed text-text-muted [&_b]:font-semibold [&_b]:text-text"
                  dangerouslySetInnerHTML={{ __html: sees }}
                />
              </div>
            </Card>
          ))}
        </div>
        <HelpCallout tone="tip" html={h.roleCards.multiOwnersNote} />
      </HelpSection>

      {/* ── Подразделения и охват ──────────────────────────────── */}
      <HelpSection title={h.departments.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.departments.text1} />
          <HelpText html={h.departments.text2} />
          <HelpText html={h.departments.text3} />
        </div>
        <HelpShot caption={h.departments.shotCaption}>
          <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
            {/* Дело с двумя участниками */}
            <div className="w-full rounded-xl border border-border bg-surface p-3.5 shadow-sm">
              <span className="text-[13px] font-bold text-text">
                {h.departments.caseLabel} · CRM-2026-014
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-cat-claim-bg px-2 py-0.5 text-[11.5px] font-semibold text-cat-claim">
                  {h.departments.lawyerChip}
                </span>
                <span className="rounded-md bg-success-bg px-2 py-0.5 text-[11.5px] font-semibold text-success">
                  {h.departments.expertChip}
                </span>
              </div>
            </div>
            {/* Стрелки к двум руководителям */}
            <div className="grid w-full grid-cols-2 gap-3">
              {[h.departments.kyivHead, h.departments.lvivHead].map((head) => (
                <div key={head} className="flex flex-col items-center gap-1">
                  <span className="h-4 w-px bg-border" aria-hidden="true" />
                  <div className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-center shadow-sm">
                    <span className="block text-[12.5px] font-semibold text-text">
                      {head}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-success">
                      <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
                      {h.departments.seesLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </HelpShot>
        <HelpCallout tone="warning" title={t.helpNav.noteLabel} html={h.departments.transitional} />
        <HelpCallout tone="tip" html={h.departments.scopeNoEffect} />
      </HelpSection>

      {/* ── 15 персональных прав ───────────────────────────────── */}
      <HelpSection title={h.caps.title}>
        <div className="flex flex-col gap-2">
          <HelpText html={h.caps.text1} />
          <HelpText html={h.caps.text2} />
        </div>
        <div className="flex flex-col gap-3">
          {CAP_GROUPS.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <header className="border-b border-border bg-surface-muted px-5 py-3">
                <h3 className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-text-muted">
                  {t.users.card.permsGroups[group.key]}
                </h3>
              </header>
              <ul className="divide-y divide-border">
                {group.caps.map((cap) => {
                  const ownerOnly = OWNER_ONLY_CAPABILITIES.includes(cap);
                  return (
                    <li key={cap} className="flex flex-col gap-1.5 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-text">
                          {t.enums.capabilityLabel[cap]}
                        </span>
                        {ownerOnly && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                            <Lock size={10.5} strokeWidth={2.4} aria-hidden="true" />
                            {h.caps.ownerOnlyBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-text-muted">
                        {t.enums.capabilityHint[cap]}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-subtle">
                        {h.caps.defaultLabel}
                        {CAP_ROLE_DEFAULTS[cap].map((role) => (
                          <span
                            key={role}
                            className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-text-muted"
                          >
                            {t.enums.roleShort[role]}
                          </span>
                        ))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      </HelpSection>

      {/* ── Правила выдачи ─────────────────────────────────────── */}
      <HelpSection title={h.grant.title}>
        <Card className="p-5">
          <ol className="flex flex-col gap-2.5">
            {h.grant.rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">
                  {i + 1}
                </span>
                <span className="text-[13.5px] leading-relaxed text-text-muted">
                  {rule}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </HelpSection>

      {/* ── Доступ и вход ──────────────────────────────────────── */}
      <HelpSection title={h.access.title}>
        <Card className="flex flex-col gap-2.5 p-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-info-bg text-info">
            <KeyRound size={18} strokeWidth={1.75} />
          </span>
          <HelpText html={h.access.text1} />
          <HelpText html={h.access.text2} />
        </Card>
        <HelpCallout tone="success" html={h.access.deactivate} />
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

      <HelpSeeAlso slugs={['payroll', 'start']} />
    </HelpShell>
  );
}

function LadderRow({
  tone,
  icon,
  name,
  note,
  scope,
  width,
}: {
  tone: string;
  icon?: React.ReactNode;
  name: string;
  note: string;
  scope: string;
  width: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-sm"
      style={{ width, minWidth: '260px' }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: tone }}
          aria-hidden="true"
        >
          {icon ?? <Eye size={13.5} strokeWidth={2.2} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-text">{name}</span>
          <span className="block truncate text-[11.5px] text-text-muted">{note}</span>
        </span>
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
        style={{ background: tone }}
      >
        {scope}
      </span>
    </div>
  );
}
