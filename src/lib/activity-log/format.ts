import {
  CASE_STAGE_LABEL,
  CASE_TYPE_LABEL,
  CASE_CATEGORY_LABEL,
  CASE_PRIORITY_LABEL,
  CLIENT_SOURCE_LABEL,
  TASK_KIND_LABEL,
  DOC_TYPE_LABEL,
  type CaseStage,
  type CaseType,
  type CaseCategory,
  type CasePriority,
  type ClientSource,
  type TaskKind,
  type DocType,
} from '@/lib/types/db';
import { LOCALE_BCP47, type Locale } from '@/lib/i18n/config';
import type { I18n } from '@/lib/i18n/core';
import type { ActivityChanges, ActivityLogEntry } from './queries';

// Форматирование записей журнала в человекочитаемый текст активного языка.
// Локализованные подписи приходят через объект переводчика (i18n: I18n) —
// модуль чистый, переводчик передаётся из серверного компонента.

// Деньги/даты форматируются по активной локали (Intl); подписи — из словаря.
const MONEY_BY_LOCALE: Partial<Record<Locale, Intl.NumberFormat>> = {};
const DATE_TIME_BY_LOCALE: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

function money(locale: Locale): Intl.NumberFormat {
  return (MONEY_BY_LOCALE[locale] ??= new Intl.NumberFormat(LOCALE_BCP47[locale], {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }));
}

function dateTime(locale: Locale): Intl.DateTimeFormat {
  return (DATE_TIME_BY_LOCALE[locale] ??= new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }));
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function asArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => String(x));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Поля-ссылки на пользователя (резолвятся через public.users).
const USER_ID_FIELDS = new Set<string>([
  'lawyer_id',
  'responsible_id',
  'assignee_id',
  'created_by',
  'uploaded_by',
  'user_id',
  'paid_by',
]);

// Поля-ссылки на клиента (резолвятся через public.clients).
const CLIENT_ID_FIELDS = new Set<string>(['client_id']);

// Карта id → имя (full_name пользователя или name клиента). Строится в
// case-activity-block.tsx и передаётся в formatActivity. Если id не найден
// (RLS скрыл, запись удалена) — мягкая деградация: усечённый id.
export type NameById = ReadonlyMap<string, string>;

// Резолв UUID пользователя/клиента в имя. Не нашли — усекаем id, не падаем.
function resolveId(value: unknown, dash: string, nameById?: NameById): string {
  const s = asString(value);
  if (!s) return dash;
  const name = nameById?.get(s);
  if (name) return name;
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

// Локализация значения поля для человекочитаемого diff'a (case.stage = 'pretrial' → «Досудебное»).
function localizeFieldValue(
  i18n: I18n,
  field: string,
  value: unknown,
  nameById?: NameById,
): string {
  const { t, locale } = i18n;
  const dash = t.common.dash;
  if (value === null || value === undefined) return dash;

  // id-поля (смена юриста/Експерта/исполнителя/клиента) → имя вместо UUID.
  if (USER_ID_FIELDS.has(field) || CLIENT_ID_FIELDS.has(field)) {
    return resolveId(value, dash, nameById);
  }

  switch (field) {
    case 'stage': {
      const s = asString(value);
      return s && s in CASE_STAGE_LABEL
        ? t.enums.caseStage[s as CaseStage]
        : String(value);
    }
    case 'case_type': {
      const s = asString(value);
      return s && s in CASE_TYPE_LABEL
        ? t.enums.caseType[s as CaseType]
        : String(value);
    }
    case 'category': {
      const s = asString(value);
      return s && s in CASE_CATEGORY_LABEL
        ? t.enums.caseCategory[s as CaseCategory]
        : String(value);
    }
    case 'source': {
      const s = asString(value);
      return s && s in CLIENT_SOURCE_LABEL
        ? t.enums.clientSource[s as ClientSource]
        : String(value);
    }
    case 'priority': {
      const s = asString(value);
      return s && s in CASE_PRIORITY_LABEL
        ? t.enums.casePriority[s as CasePriority]
        : String(value);
    }
    case 'kind': {
      const s = asString(value);
      return s && s in TASK_KIND_LABEL
        ? t.enums.taskKind[s as TaskKind]
        : String(value);
    }
    case 'doc_type': {
      const s = asString(value);
      return s && s in DOC_TYPE_LABEL
        ? t.enums.docType[s as DocType]
        : String(value);
    }
    case 'contract_sum':
    case 'amount': {
      const n = asNumber(value);
      return n === null ? String(value) : `${money(locale).format(n)} ₴`;
    }
    case 'opened_at':
    case 'paid_at':
    case 'closed_at': {
      const s = asString(value);
      return s ?? String(value);
    }
    case 'due_at': {
      const s = asString(value);
      if (!s) return dash;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : dateTime(locale).format(d);
    }
    case 'tags':
    case 'billing_types': {
      const arr = asArray(value);
      return arr && arr.length > 0 ? arr.join(', ') : dash;
    }
    default: {
      const s = asString(value);
      return s ?? JSON.stringify(value);
    }
  }
}

function fieldLabel(i18n: I18n, field: string): string {
  const map = i18n.t.activity.field as Record<string, string>;
  return map[field] ?? field;
}

function formatDiff(
  i18n: I18n,
  changes: ActivityChanges | null,
  nameById?: NameById,
): string {
  if (!changes) return '';
  const diff = (changes as Record<string, unknown>).diff;
  if (!diff || typeof diff !== 'object') return '';
  const entries = Object.entries(diff as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([field, val]) => {
      const v = val as { from?: unknown; to?: unknown };
      const label = fieldLabel(i18n, field);
      return `${label}: ${localizeFieldValue(i18n, field, v.from, nameById)} → ${localizeFieldValue(i18n, field, v.to, nameById)}`;
    })
    .join(', ');
}

// Подпись action-кода (allowlist) — fallback в default-ветке formatActivity.
function actionLabel(i18n: I18n, action: string): string | undefined {
  const map = i18n.t.activity.action as Record<string, string>;
  return map[action];
}

export type FormattedActivity = {
  // Сам action'ный «глагол» (текст события).
  text: string;
  // ФИО автора события (или «Система», если user_id=null — service_role).
  actor: string;
};

export function formatActivity(
  i18n: I18n,
  entry: ActivityLogEntry,
  nameById?: NameById,
): FormattedActivity {
  const { t, fmt } = i18n;
  const ev = t.activity.event;
  const actor = entry.user?.full_name ?? t.activity.actorSystem;
  const changes = entry.changes ?? {};
  const c = changes as Record<string, unknown>;
  const dash = t.common.dash;

  switch (entry.action) {
    // ---------- cases ----------
    case 'case_created':
      return { actor, text: ev.caseCreated };
    case 'case_updated': {
      const detail = formatDiff(i18n, changes, nameById);
      return {
        actor,
        text: detail ? fmt(ev.caseChanged, { detail }) : ev.caseUpdated,
      };
    }
    case 'case_deleted':
      return { actor, text: ev.caseDeleted };
    case 'stage_corrected': {
      const from = asString(c.from);
      const to = asString(c.to);
      const fromLabel = from && from in CASE_STAGE_LABEL ? t.enums.caseStage[from as CaseStage] : (from ?? dash);
      const toLabel = to && to in CASE_STAGE_LABEL ? t.enums.caseStage[to as CaseStage] : (to ?? dash);
      return { actor, text: fmt(ev.stageReverted, { from: fromLabel, to: toLabel }) };
    }

    // ---------- documents ----------
    case 'document_uploaded': {
      const name = asString(c.file_name) ?? dash;
      const type = asString(c.doc_type);
      const typeLabel = type && type in DOC_TYPE_LABEL ? t.enums.docType[type as DocType] : null;
      return {
        actor,
        text: typeLabel
          ? fmt(ev.documentUploadedTyped, { name, type: typeLabel })
          : fmt(ev.documentUploaded, { name }),
      };
    }
    case 'document_deleted': {
      const name = asString(c.file_name) ?? dash;
      return { actor, text: fmt(ev.documentDeleted, { name }) };
    }

    // ---------- payments ----------
    case 'payment_created': {
      const amount = asNumber(c.amount);
      const paidAt = asString(c.paid_at);
      const method = asString(c.method);
      const amountStr = amount === null ? dash : `${money(i18n.locale).format(amount)} ₴`;
      const parts = [fmt(ev.paymentChunk, { amount: amountStr })];
      if (paidAt) parts.push(fmt(ev.paymentFrom, { date: paidAt }));
      if (method) parts.push(`(${method})`);
      return { actor, text: fmt(ev.paymentAdded, { parts: parts.join(' ') }) };
    }
    case 'payment_deleted': {
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? dash : `${money(i18n.locale).format(amount)} ₴`;
      return { actor, text: fmt(ev.paymentDeleted, { amount: amountStr }) };
    }

    // ---------- tasks ----------
    case 'task_created': {
      const title = asString(c.title) ?? dash;
      const kind = asString(c.kind);
      // Винительный падеж: задачу/заседание/дедлайн (taskKind — именительный).
      const acc =
        kind === 'task' ? ev.taskAccTask
        : kind === 'hearing' ? ev.taskAccHearing
        : kind === 'deadline' ? ev.taskAccDeadline
        : ev.taskAccTask;
      return { actor, text: fmt(ev.taskCreated, { kind: acc, title }) };
    }
    case 'task_updated': {
      const detail = formatDiff(i18n, changes, nameById);
      const title = asString(c.title);
      const suffix = title ? fmt(ev.taskTitleSuffix, { title }) : '';
      return {
        actor,
        text: detail
          ? fmt(ev.taskChanged, { suffix, detail })
          : fmt(ev.taskUpdated, { suffix }),
      };
    }
    case 'task_toggled': {
      const status = asString(c.status);
      const title = asString(c.title);
      const suffix = title ? fmt(ev.taskTitleSuffix, { title }) : '';
      if (status === 'done') return { actor, text: fmt(ev.taskDone, { suffix }) };
      if (status === 'open') return { actor, text: fmt(ev.taskReopened, { suffix }) };
      return { actor, text: fmt(ev.taskToggled, { suffix }) };
    }
    case 'task_deleted': {
      const title = asString(c.title) ?? dash;
      return { actor, text: fmt(ev.taskDeleted, { title }) };
    }

    // ---------- payroll (леджер выплат) ----------
    case 'payroll_paid':
    case 'payroll_reverted': {
      const role = asString(c.role_in_case);
      const roleLabel =
        role && role in t.enums.roleInCase
          ? t.enums.roleInCase[role as keyof typeof t.enums.roleInCase]
          : role;
      const who = resolveId(c.user_id, dash, nameById);
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${money(i18n.locale).format(amount)} ₴`;
      // «Юрист Иванов — 2 500 ₴» (части, которых нет, опускаем).
      const parts = [roleLabel, who].filter(Boolean).join(' ');
      const tail = [parts, amountStr].filter(Boolean).join(' — ');
      const verb =
        entry.action === 'payroll_paid' ? ev.payrollPaid : ev.payrollReverted;
      return { actor, text: tail ? fmt(ev.payrollDetail, { verb, tail }) : verb };
    }

    default:
      // Неизвестный/новый action — берём подпись из карты, иначе показываем код
      // (видно, что в журнал прилетело что-то новое, а не ломаем рендер).
      return {
        actor,
        text: actionLabel(i18n, entry.action) ?? fmt(ev.unknownAction, { action: entry.action }),
      };
  }
}

// Собирает UUID пользователей и клиентов из набора записей журнала — чтобы
// одним запросом резолвить их в имена (см. resolveActivityNames). Сканирует и
// top-level changes (payroll user_id и пр.), и diff (смена юриста/Експерта/клиента).
export function collectActivityIds(entries: ReadonlyArray<ActivityLogEntry>): {
  userIds: string[];
  clientIds: string[];
} {
  const users = new Set<string>();
  const clients = new Set<string>();

  const push = (field: string, value: unknown) => {
    const s = asString(value);
    if (!s || !UUID_RE.test(s)) return;
    if (USER_ID_FIELDS.has(field)) users.add(s);
    else if (CLIENT_ID_FIELDS.has(field)) clients.add(s);
  };

  for (const entry of entries) {
    const c = (entry.changes ?? {}) as Record<string, unknown>;
    for (const [field, value] of Object.entries(c)) {
      if (field === 'diff') continue;
      push(field, value);
    }
    const diff = c.diff;
    if (diff && typeof diff === 'object') {
      for (const [field, val] of Object.entries(diff as Record<string, unknown>)) {
        const v = val as { from?: unknown; to?: unknown };
        push(field, v.from);
        push(field, v.to);
      }
    }
  }

  return { userIds: [...users], clientIds: [...clients] };
}

// Относительное время (5 мин назад / 2 ч назад / вчера / 12.05.2026).
// Для свежих событий — relative; для старых — абсолютная дата.
export function formatActivityTime(
  i18n: I18n,
  iso: string,
  now: Date = new Date(),
): string {
  const { t, fmt, locale } = i18n;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return t.activity.time.justNow;
  if (diffMin < 60) return fmt(t.activity.time.minAgo, { n: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return fmt(t.activity.time.hAgo, { n: diffH });
  const diffDays = Math.round(diffH / 24);
  if (diffDays === 1) return t.activity.time.yesterday;
  if (diffDays < 7) return fmt(t.activity.time.daysAgo, { n: diffDays });
  return dateTime(locale).format(d);
}
