import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { actionVisual, TONE_CLASS } from './action-visual';
import {
  extractDiffEntries,
  fieldLabel,
  formatActivity,
  localizeFieldValue,
  type NameById,
} from '@/lib/activity-log/format';
import type { ActivityLogEntry } from '@/lib/activity-log/queries';
import type { JournalTargets } from '@/lib/activity-log/journal';
import type { I18n } from '@/lib/i18n/core';
import { LOCALE_BCP47, type Locale } from '@/lib/i18n/config';
import {
  CASE_STAGE_LABEL,
  CASE_CATEGORY_LABEL,
  type CaseStage,
  type CaseCategory,
} from '@/lib/types/db';
import { cn } from '@/lib/utils';

// ============================================================================
// Богатая строка журнала (по образцу владельца, 2026-07-21): цель события —
// жирная ссылка прямо в тексте; изменения — цветные чипы «было → стало»
// (этап — тонами воронки); суммы — жирные и цветные (приход зелёный, расход/
// удаление красный, зарплата оранжевая); комментарии/описания — цитатой.
// Для редких действий — фолбэк на плоский текст formatActivity.
// ============================================================================

// Чипы значений. Заливка *-bg + тёмный текст *-fg / *-text (DESIGN.md §3, AA).
const STAGE_CHIP: Record<CaseStage, string> = {
  new_request: 'text-stage-new-fg bg-stage-new-bg',
  consultation: 'text-stage-consultation-fg bg-stage-consultation-bg',
  in_progress: 'text-stage-in-progress-fg bg-stage-in-progress-bg',
  awaiting_decision: 'text-stage-awaiting-fg bg-stage-awaiting-bg',
  closed: 'text-stage-closed-fg bg-stage-closed-bg',
};

const CATEGORY_CHIP: Record<CaseCategory, string> = {
  document: 'text-cat-document-fg bg-cat-document-bg',
  claim: 'text-cat-claim-fg bg-cat-claim-bg',
  representation: 'text-cat-representation-fg bg-cat-representation-bg',
};

const CHIP_BASE =
  'inline-flex max-w-full items-center truncate rounded-chip px-2 py-0.5 text-[11.5px] font-semibold leading-[1.4]';
const CHIP_NEUTRAL = 'bg-surface-sunken text-text';

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn(CHIP_BASE, className ?? CHIP_NEUTRAL)}>{children}</span>;
}

// Деньги: 11 873 ₴ (локаль-зависимые разряды).
const MONEY_BY_LOCALE: Partial<Record<Locale, Intl.NumberFormat>> = {};
function fmtMoney(locale: Locale, n: number): string {
  const f = (MONEY_BY_LOCALE[locale] ??= new Intl.NumberFormat(LOCALE_BCP47[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }));
  return `${f.format(n)} ₴`;
}

const DATE_BY_LOCALE: Partial<Record<Locale, Intl.DateTimeFormat>> = {};
function fmtDay(locale: Locale, s: string): string {
  const f = (DATE_BY_LOCALE[locale] ??= new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }));
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : f.format(d);
}

function asStr(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function truncate(s: string, max = 140): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ФИО из карты имён (или усечённый uuid — RLS спрятал / запись удалена).
function personName(names: NameById | undefined, v: unknown, dash: string): string {
  const s = asStr(v);
  if (!s) return dash;
  return names?.get(s) ?? (s.length > 8 ? `${s.slice(0, 8)}…` : s);
}

// Цитата (комментарий, описание операции, причина отказа).
function Quote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 max-w-xl rounded-lg border-l-2 border-border-strong bg-surface-muted px-2.5 py-1.5 text-[12.5px] leading-snug text-text-muted">
      {children}
    </p>
  );
}

// Строка «Метка: было → стало».
function FromTo({
  label,
  from,
  to,
}: {
  label: string;
  from: ReactNode;
  to: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] leading-[1.5]">
      <span className="text-text-muted">{label}</span>
      {from}
      <ArrowRight size={12} strokeWidth={2.2} className="shrink-0 text-text-subtle" aria-hidden="true" />
      {to}
    </div>
  );
}

// Значение diff-поля: enum'ы — цветными чипами, остальное — текстом
// (старое приглушённое, новое жирное).
function DiffValue({
  i18n,
  field,
  value,
  names,
  side,
}: {
  i18n: I18n;
  field: string;
  value: unknown;
  names?: NameById;
  side: 'from' | 'to';
}) {
  const { t } = i18n;
  const s = asStr(value);

  if (field === 'stage' && s && s in CASE_STAGE_LABEL) {
    return <Chip className={STAGE_CHIP[s as CaseStage]}>{t.enums.caseStage[s as CaseStage]}</Chip>;
  }
  if (field === 'category' && s && s in CASE_CATEGORY_LABEL) {
    return (
      <Chip className={CATEGORY_CHIP[s as CaseCategory]}>{t.enums.caseCategory[s as CaseCategory]}</Chip>
    );
  }
  if (field === 'priority' && (s === 'normal' || s === 'urgent')) {
    return (
      <Chip className={s === 'urgent' ? 'bg-error-bg text-error-text' : undefined}>
        {t.enums.casePriority[s]}
      </Chip>
    );
  }

  const text = localizeFieldValue(i18n, field, value, names);
  const isMoney = field === 'contract_sum' || field === 'amount';
  return side === 'from' ? (
    <span className={cn('text-text-subtle', isMoney && 'tabular-nums')}>{text}</span>
  ) : (
    <span className={cn('font-semibold text-text', isMoney && 'tabular-nums')}>{text}</span>
  );
}

// Суммы: тон по смыслу (приход/расход/зарплата) + tabular-nums.
function Money({
  locale,
  amount,
  tone,
}: {
  locale: Locale;
  amount: number;
  tone: 'in' | 'out' | 'payout' | 'plain';
}) {
  const cls =
    tone === 'in'
      ? 'text-success-text'
      : tone === 'out'
        ? 'text-error'
        : tone === 'payout'
          ? 'text-warning-text'
          : 'text-text';
  return <span className={cn('font-bold tabular-nums', cls)}>{fmtMoney(locale, amount)}</span>;
}

// ── Разбор события в богатые части ───────────────────────────────────────────
type RichParts = {
  /** Глагольная часть (муted). null → фолбэк на formatActivity-текст. */
  verb: string | null;
  /** Жирное значение сразу после цели (сумма, «файл», №акта…). */
  value?: ReactNode;
  /** Вторая строка: diff-чипы, цитаты, период отпуска и т.п. */
  detail?: ReactNode;
};

function buildRich(i18n: I18n, entry: ActivityLogEntry, names: NameById): RichParts {
  const { t, fmt, locale } = i18n;
  const dash = t.common.dash;
  const c = (entry.changes ?? {}) as Record<string, unknown>;
  const action = (t.activity.action as Record<string, string>)[entry.action];
  const rich = t.journal.rich;

  // Diff-строки для *_updated (дело/задача/клиент). Пустой diff → просто глагол.
  const diffDetail = (): ReactNode => {
    const entries = extractDiffEntries(entry.changes);
    if (entries.length === 0) return undefined;
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        {entries.map((d) => (
          <FromTo
            key={d.field}
            label={`${fieldLabel(i18n, d.field).charAt(0).toUpperCase()}${fieldLabel(i18n, d.field).slice(1)}:`}
            from={<DiffValue i18n={i18n} field={d.field} value={d.from} names={names} side="from" />}
            to={<DiffValue i18n={i18n} field={d.field} value={d.to} names={names} side="to" />}
          />
        ))}
      </div>
    );
  };

  switch (entry.action) {
    // ── Дела ──
    case 'case_created':
    case 'client_created':
    case 'client_deleted':
    case 'case_deleted':
    case 'case_archived':
    case 'case_restored':
      return { verb: action ?? null };
    case 'case_updated':
    case 'client_updated':
      return { verb: action ?? null, detail: diffDetail() };
    case 'case_lost': {
      const reason = asStr(c.reason);
      return {
        verb: action ?? null,
        detail: reason ? (
          <Quote>
            <span className="font-medium text-text">{rich.reasonLabel}</span>{' '}
            {truncate(reason)}
          </Quote>
        ) : undefined,
      };
    }
    case 'stage_corrected': {
      const from = asStr(c.from);
      const to = asStr(c.to);
      return {
        verb: action ?? null,
        detail:
          from || to ? (
            <div className="mt-1.5">
              <FromTo
                label={rich.stageLabel}
                from={<DiffValue i18n={i18n} field="stage" value={from} side="from" />}
                to={<DiffValue i18n={i18n} field="stage" value={to} side="to" />}
              />
            </div>
          ) : undefined,
      };
    }

    // ── Платежи ──
    case 'payment_created':
    case 'payment_updated':
    case 'payment_deleted': {
      const amount = asNum(c.amount);
      const paidAt = asStr(c.paid_at);
      const method = asStr(c.method);
      const tone =
        entry.action === 'payment_created'
          ? 'in'
          : entry.action === 'payment_deleted'
            ? 'out'
            : 'plain';
      return {
        verb: action ?? null,
        value: (
          <>
            {amount !== null && (
              <>
                <span className="text-text-muted">{rich.forAmount}</span>{' '}
                <Money locale={locale} amount={amount} tone={tone} />
              </>
            )}
            {paidAt && (
              <span className="text-text-subtle"> · {fmtDay(locale, paidAt)}</span>
            )}
            {method && <span className="text-text-subtle"> ({method})</span>}
          </>
        ),
      };
    }

    // ── Акты ──
    case 'act_created':
    case 'act_paid':
    case 'act_deleted':
    case 'act_completion_changed': {
      const number = asNum(c.number);
      const amount = asNum(c.confirmed_amount) ?? asNum(c.amount);
      const tone =
        entry.action === 'act_paid' ? 'in' : entry.action === 'act_deleted' ? 'out' : 'plain';
      const completion = asStr(c.completion);
      return {
        verb: action ?? null,
        value: (
          <>
            {number !== null && (
              <span className="font-semibold text-text">
                {fmt(rich.actNo, { n: number })}
              </span>
            )}
            {amount !== null && (
              <>
                {' '}
                <span className="text-text-muted">{rich.forAmount}</span>{' '}
                <Money locale={locale} amount={amount} tone={tone} />
              </>
            )}
          </>
        ),
        detail:
          entry.action === 'act_completion_changed' && completion ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-text-muted">{rich.completionLabel}</span>
              <Chip
                className={
                  completion === 'full'
                    ? 'bg-success-bg text-success-text'
                    : 'bg-warning-bg text-warning-text'
                }
              >
                {completion in t.enums.actCompletion
                  ? t.enums.actCompletion[completion as keyof typeof t.enums.actCompletion]
                  : completion}
              </Chip>
            </div>
          ) : undefined,
      };
    }

    // ── Зарплата ──
    case 'payroll_payout':
    case 'payroll_bonus': {
      const who = personName(names, c.user_id, dash);
      const amount = asNum(c.amount);
      const comment = asStr(c.comment);
      return {
        verb: action ?? null,
        value: (
          <>
            <span className="font-semibold text-text">{who}</span>
            {amount !== null && (
              <>
                {' '}
                <span className="text-text-muted">{rich.forAmount}</span>{' '}
                <Money locale={locale} amount={amount} tone="payout" />
              </>
            )}
          </>
        ),
        detail:
          entry.action === 'payroll_bonus' && comment ? (
            <Quote>{truncate(comment)}</Quote>
          ) : undefined,
      };
    }
    case 'payroll_tx_deleted': {
      const who = personName(names, c.user_id, dash);
      const amount = asNum(c.amount);
      const date = asStr(c.occurred_on);
      return {
        verb: asStr(c.kind) === 'bonus' ? rich.txDeletedBonus : rich.txDeletedPayout,
        value: (
          <>
            <span className="font-semibold text-text">{who}</span>
            {amount !== null && (
              <>
                {' '}
                <span className="text-text-muted">{rich.forAmount}</span>{' '}
                <Money locale={locale} amount={amount} tone="out" />
              </>
            )}
            {date && <span className="text-text-subtle"> · {fmtDay(locale, date)}</span>}
          </>
        ),
      };
    }
    case 'payroll_rates_changed': {
      const rates = Array.isArray(c.rates)
        ? (c.rates as Array<Record<string, unknown>>)
        : [];
      if (rates.length === 0) return { verb: action ?? null };
      return {
        verb: action ?? null,
        detail: (
          <div className="mt-1.5 flex flex-col gap-1">
            {rates.map((r, i) => {
              const cat = asStr(r.category);
              const catLabel =
                cat && cat in CASE_CATEGORY_LABEL
                  ? t.enums.caseCategory[cat as CaseCategory]
                  : (cat ?? dash);
              const seg = (
                role: string,
                from: number | null,
                to: number | null,
                changed: boolean,
              ) => (
                <span className="inline-flex items-center gap-1">
                  <span className="text-text-muted">{role}</span>
                  <span className={cn('tabular-nums', changed ? 'text-text-subtle' : 'text-text-muted')}>
                    {from ?? dash}%
                  </span>
                  <ArrowRight size={11} strokeWidth={2.2} className="text-text-subtle" aria-hidden="true" />
                  <span className={cn('tabular-nums font-semibold', changed ? 'text-text' : 'text-text-muted')}>
                    {to ?? dash}%
                  </span>
                </span>
              );
              const lf = asNum(r.lawyer_from);
              const lt = asNum(r.lawyer_to);
              const ef = asNum(r.expert_from);
              const et = asNum(r.expert_to);
              return (
                <div key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
                  {cat && cat in CASE_CATEGORY_LABEL ? (
                    <Chip className={CATEGORY_CHIP[cat as CaseCategory]}>{catLabel}</Chip>
                  ) : (
                    <span className="text-text-muted">{catLabel}:</span>
                  )}
                  {seg(rich.rateLawyer, lf, lt, lf !== lt)}
                  {seg(rich.rateExpert, ef, et, ef !== et)}
                </div>
              );
            })}
          </div>
        ),
      };
    }

    // ── Касса ──
    case 'cash_entry_created':
    case 'cash_entry_updated':
    case 'cash_entry_deleted': {
      const amount = asNum(c.amount);
      const accName = asStr(c.account_name);
      const description = asStr(c.description);
      const date = asStr(c.entry_date);
      const out = asStr(c.direction) === 'out';
      const verb =
        entry.action === 'cash_entry_deleted'
          ? rich.cashDeleted
          : entry.action === 'cash_entry_updated'
            ? (action ?? null)
            : out
              ? rich.cashOut
              : rich.cashIn;
      const tone =
        entry.action === 'cash_entry_deleted' ? 'out' : out ? 'payout' : 'in';
      return {
        verb,
        value: (
          <>
            {amount !== null && <Money locale={locale} amount={amount} tone={tone} />}
            {accName && (
              <>
                {' '}
                <Chip>{accName}</Chip>
              </>
            )}
            {date && <span className="text-text-subtle"> · {fmtDay(locale, date)}</span>}
          </>
        ),
        detail: description ? <Quote>{truncate(description)}</Quote> : undefined,
      };
    }

    // ── Документы ──
    case 'document_uploaded':
    case 'document_deleted':
    case 'document_downloaded': {
      const name = asStr(c.file_name);
      const type = asStr(c.doc_type);
      const typeLabel =
        type && type in t.enums.docType
          ? t.enums.docType[type as keyof typeof t.enums.docType]
          : null;
      return {
        verb: action ?? null,
        value: (
          <>
            {name && <span className="font-semibold text-text">«{name}»</span>}
            {typeLabel && (
              <>
                {' '}
                <Chip>{typeLabel}</Chip>
              </>
            )}
          </>
        ),
      };
    }

    // ── Задачи ──
    case 'task_created':
    case 'task_updated':
    case 'task_toggled':
    case 'task_deleted': {
      const title = asStr(c.title);
      const kind = asStr(c.kind);
      const kindLabel =
        kind && kind in t.enums.taskKind
          ? t.enums.taskKind[kind as keyof typeof t.enums.taskKind]
          : null;
      return {
        verb: action ?? null,
        value: (
          <>
            {title && <span className="font-semibold text-text">«{truncate(title, 80)}»</span>}
            {kindLabel && entry.action === 'task_created' && (
              <>
                {' '}
                <Chip>{kindLabel}</Chip>
              </>
            )}
          </>
        ),
        detail: entry.action === 'task_updated' ? diffDetail() : undefined,
      };
    }

    // ── Комментарии ──
    case 'comment_added':
    case 'comment_deleted': {
      const text = asStr(c.text);
      return {
        verb: action ?? null,
        detail: text ? <Quote>«{truncate(text)}»</Quote> : undefined,
      };
    }
    case 'comment_edited': {
      const from = asStr(c.from);
      const to = asStr(c.to);
      return {
        verb: action ?? null,
        detail:
          from || to ? (
            <Quote>
              <span className="line-through decoration-border-strong">
                «{truncate(from ?? dash, 70)}»
              </span>{' '}
              → <span className="text-text">«{truncate(to ?? dash, 70)}»</span>
            </Quote>
          ) : undefined,
      };
    }

    // ── Отпуска ──
    case 'absence_created':
    case 'absence_deleted': {
      const who = personName(names, c.user_id, dash);
      const kind = asStr(c.kind);
      const kindLabel =
        kind && kind in t.enums.absenceKind
          ? t.enums.absenceKind[kind as keyof typeof t.enums.absenceKind]
          : null;
      const from = asStr(c.starts_on);
      const to = asStr(c.ends_on);
      return {
        verb: action ?? null,
        value: <span className="font-semibold text-text">{who}</span>,
        detail: (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            {kindLabel && <Chip className="bg-absence-bg text-absence">{kindLabel}</Chip>}
            {(from || to) && (
              <>
                <span className="text-text-muted">{rich.periodLabel}</span>
                <span className="font-semibold tabular-nums text-text">
                  {from ? fmtDay(locale, from) : dash} – {to ? fmtDay(locale, to) : dash}
                </span>
              </>
            )}
          </div>
        ),
      };
    }

    // ── Кадровые и структурные события: глагол + имя-ссылка в одной фразе ──
    case 'user_created':
    case 'user_role_changed':
    case 'user_deactivated':
    case 'user_reactivated':
    case 'user_permissions_changed':
    case 'user_department_changed':
    case 'user_salary_changed':
    case 'user_password_reset':
    case 'user_email_changed':
    case 'user_invited':
    case 'user_deleted':
    case 'user_password_changed':
    case 'department_created':
    case 'department_renamed':
    case 'department_activated':
    case 'department_deactivated':
    case 'payment_plan_updated':
      return { verb: action ?? null, detail: diffDetail() };

    default:
      // Логины (IP, причина), счета кассы («имя»), реквизиты и прочее —
      // готовые фразы formatActivity.
      return { verb: null };
  }
}

// ── Инлайн-цель события: жирная ссылка в тексте ─────────────────────────────
function targetLink(
  entry: ActivityLogEntry,
  targets: JournalTargets,
  labels: { cash: string; settings: string },
): { href: string; label: string } | null {
  switch (entry.entity_type) {
    case 'case': {
      const title = targets.caseById.get(entry.entity_id);
      return title ? { href: `/cases/${entry.entity_id}`, label: title } : null;
    }
    case 'client': {
      const name = targets.clientById.get(entry.entity_id);
      return name ? { href: `/clients/${entry.entity_id}`, label: name } : null;
    }
    case 'user': {
      if (entry.entity_id === entry.user?.id) return null;
      const name = targets.userById.get(entry.entity_id);
      return name ? { href: `/reports/payroll/${entry.entity_id}`, label: name } : null;
    }
    case 'absence':
      // ФИО сотрудника уже жирным в тексте события — ссылка не дублируется.
      return null;
    case 'cash':
      return { href: '/reports/cash', label: labels.cash };
    case 'org':
      return {
        href:
          entry.action === 'payroll_rates_changed'
            ? '/settings/payroll'
            : '/settings/requisites',
        label: labels.settings,
      };
    case 'department':
      return { href: '/settings/departments', label: labels.settings };
    default:
      return null;
  }
}

// ── Сама строка ленты ────────────────────────────────────────────────────────
export function JournalRow({
  entry,
  i18n,
  names,
  targets,
  time,
  timeTitle,
}: {
  entry: ActivityLogEntry;
  i18n: I18n;
  names: NameById;
  targets: JournalTargets;
  time: string;
  timeTitle: string;
}) {
  const { t } = i18n;

  const visual = actionVisual(entry.action);
  const Icon = visual.icon;

  const actor = entry.user?.full_name ?? t.activity.actorSystem;
  const rich = buildRich(i18n, entry, names);
  const target = targetLink(entry, targets, {
    cash: t.nav.finance,
    settings: t.nav.settings,
  });

  const link = target && (
    <Link
      href={target.href}
      className="font-semibold text-text underline-offset-2 transition-colors hover:text-primary-pressed hover:underline"
    >
      {target.label}
    </Link>
  );

  return (
    <li className="flex items-start gap-3 border-b border-border/60 px-4 py-2.5 transition-colors last:border-0 hover:bg-primary-softer/50">
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          TONE_CLASS[visual.tone],
        )}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-[1.55] text-text">
          <span className="font-semibold">{actor}</span>{' '}
          {rich.verb !== null ? (
            <>
              <span className="text-text-muted">{rich.verb}</span>
              {link && <> {link}</>}
              {rich.value && <> {rich.value}</>}
            </>
          ) : (
            <>
              <span className="text-text-muted">
                {formatActivity(i18n, entry, names).text}
              </span>
              {link && <> · {link}</>}
            </>
          )}
        </p>
        {rich.detail}
      </div>

      <time
        dateTime={entry.created_at}
        title={timeTitle}
        className="mt-1 shrink-0 text-[12px] tabular-nums text-text-subtle"
      >
        {time}
      </time>
    </li>
  );
}
