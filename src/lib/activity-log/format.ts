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
import { UUID_RE } from '@/lib/validation';

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

const DATE_ONLY_BY_LOCALE: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

function dateOnly(locale: Locale): Intl.DateTimeFormat {
  return (DATE_ONLY_BY_LOCALE[locale] ??= new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }));
}

// YYYY-MM-DD → локальная дата (журнал: отпуска, движения ЗП). Мусор — как есть.
function formatDateStr(locale: Locale, v: unknown): string {
  const s = asString(v);
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : dateOnly(locale).format(d);
}

// Усечение длинного текста для строки журнала (комментарии, описания кассы).
function truncText(v: unknown, dash: string, max = 80): string {
  const s = asString(v);
  if (!s) return dash;
  return s.length > max ? `${s.slice(0, max)}…` : s;
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
// Экспорт: журнал (/journal) рендерит diff-строки сам (чипы этапов и т.п.).
export function localizeFieldValue(
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
      // Встроенные коды — через словарь; кастомные — через nameById (в него
      // мерджатся пары code→лейбл справочника типов дел); иначе сам код.
      const s = asString(value);
      if (!s) return String(value);
      if (s in CASE_TYPE_LABEL) return t.enums.caseType[s as CaseType];
      return nameById?.get(s) ?? s;
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

export function fieldLabel(i18n: I18n, field: string): string {
  const map = i18n.t.activity.field as Record<string, string>;
  return map[field] ?? field;
}

// Структурированный diff из changes.diff — для богатого рендера в журнале
// («Этап: [чип] → [чип]»). Порядок полей сохраняется как записан.
export type DiffEntry = { field: string; from: unknown; to: unknown };

export function extractDiffEntries(changes: ActivityChanges | null): DiffEntry[] {
  if (!changes) return [];
  const diff = (changes as Record<string, unknown>).diff;
  if (!diff || typeof diff !== 'object') return [];
  return Object.entries(diff as Record<string, unknown>).map(([field, val]) => {
    const v = (val ?? {}) as { from?: unknown; to?: unknown };
    return { field, from: v.from, to: v.to };
  });
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
    case 'case_lost': {
      const reason = asString(c.reason);
      return {
        actor,
        text: reason ? fmt(ev.caseLostReason, { reason }) : ev.caseLost,
      };
    }
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
    case 'payment_updated': {
      // Задел под журналирование правок платежей (из UI пока не вызывается).
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${money(i18n.locale).format(amount)} ₴`;
      return {
        actor,
        text: amountStr ? fmt(ev.paymentUpdatedAmount, { amount: amountStr }) : ev.paymentUpdated,
      };
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
    case 'payroll_payout': {
      // Выплата зарплаты (createPayoutAction): кому и сколько.
      const who = resolveId(c.user_id, dash, nameById);
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${money(i18n.locale).format(amount)} ₴`;
      const tail = [who, amountStr].filter(Boolean).join(' — ');
      return { actor, text: tail ? fmt(ev.payrollPayoutDetail, { tail }) : ev.payrollPayout };
    }

    // ---------- acts (Рахунок-Акт) ----------
    case 'act_deleted': {
      const number = asNumber(c.number);
      const amount = asNumber(c.amount);
      const numStr = number === null ? dash : String(number);
      const amountStr = amount === null ? dash : `${money(i18n.locale).format(amount)} ₴`;
      return { actor, text: fmt(ev.actDeleted, { number: numStr, amount: amountStr }) };
    }

    // ---------- comments ----------
    case 'comment_edited': {
      // Усекаем для строки журнала (тексты могут быть длинными).
      return {
        actor,
        text: fmt(ev.commentEdited, {
          from: truncText(c.from, dash),
          to: truncText(c.to, dash),
        }),
      };
    }
    case 'comment_added':
      return { actor, text: fmt(ev.commentAdded, { text: truncText(c.text, dash) }) };
    case 'comment_deleted':
      return { actor, text: fmt(ev.commentDeleted, { text: truncText(c.text, dash) }) };

    // ---------- журнал 2026-07-21: скачивания, акты, премии ----------
    case 'document_downloaded': {
      const name = asString(c.file_name) ?? dash;
      const type = asString(c.doc_type);
      const typeLabel = type && type in DOC_TYPE_LABEL ? t.enums.docType[type as DocType] : null;
      return {
        actor,
        text: typeLabel
          ? fmt(ev.documentDownloadedTyped, { name, type: typeLabel })
          : fmt(ev.documentDownloaded, { name }),
      };
    }
    case 'act_completion_changed': {
      const number = asNumber(c.number);
      const completion = asString(c.completion);
      const label =
        completion && completion in t.enums.actCompletion
          ? t.enums.actCompletion[completion as keyof typeof t.enums.actCompletion]
          : (completion ?? dash);
      return {
        actor,
        text: fmt(ev.actCompletionChanged, {
          number: number === null ? dash : String(number),
          completion: label,
        }),
      };
    }
    case 'payroll_bonus': {
      const who = resolveId(c.user_id, dash, nameById);
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${money(i18n.locale).format(amount)} ₴`;
      const comment = asString(c.comment);
      const tail = [who, amountStr].filter(Boolean).join(' — ');
      const suffix = comment
        ? fmt(ev.payrollBonusComment, { comment: truncText(comment, dash) })
        : '';
      return { actor, text: fmt(ev.payrollBonus, { tail }) + suffix };
    }
    case 'payroll_tx_deleted': {
      const who = resolveId(c.user_id, dash, nameById);
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${money(i18n.locale).format(amount)} ₴`;
      const kind =
        asString(c.kind) === 'bonus' ? ev.payrollTxKindBonus : ev.payrollTxKindPayout;
      const date = formatDateStr(i18n.locale, c.occurred_on);
      const tail = [[who, amountStr].filter(Boolean).join(' — '), date && `(${date})`]
        .filter(Boolean)
        .join(' ');
      return { actor, text: fmt(ev.payrollTxDeleted, { kind, tail }) };
    }

    // ---------- журнал 2026-07-21: доступ и безопасность ----------
    case 'user_password_changed':
      return { actor, text: ev.passwordChanged };
    case 'user_login': {
      const ip = asString(c.ip);
      return { actor, text: ev.login + (ip ? fmt(ev.loginIp, { ip }) : '') };
    }
    case 'user_login_failed': {
      const reason = asString(c.reason);
      const ip = asString(c.ip);
      const attempt = asNumber(c.attempt);
      const base =
        reason === 'inactive'
          ? ev.loginFailedInactive
          : reason === 'wrong_password'
            ? fmt(ev.loginFailedPassword, { n: attempt === null ? '?' : attempt })
            : ev.loginFailed;
      return { actor, text: base + (ip ? fmt(ev.loginIp, { ip }) : '') };
    }

    // ---------- журнал 2026-07-21: отпуска ----------
    case 'absence_created':
    case 'absence_deleted': {
      const who = resolveId(c.user_id, dash, nameById);
      const kind = asString(c.kind);
      const kindLabel =
        kind && kind in t.enums.absenceKind
          ? t.enums.absenceKind[kind as keyof typeof t.enums.absenceKind]
          : (kind ?? dash);
      const tail = fmt(ev.absencePeriod, {
        who,
        kind: kindLabel,
        from: formatDateStr(i18n.locale, c.starts_on) || dash,
        to: formatDateStr(i18n.locale, c.ends_on) || dash,
      });
      const verb = entry.action === 'absence_created' ? ev.absenceCreated : ev.absenceDeleted;
      return { actor, text: fmt(verb, { tail }) };
    }

    // ---------- журнал 2026-07-21: касса ----------
    case 'cash_account_created':
      return { actor, text: fmt(ev.cashAccountCreated, { name: asString(c.name) ?? dash }) };
    case 'cash_account_updated':
      return { actor, text: fmt(ev.cashAccountUpdated, { name: asString(c.name) ?? dash }) };
    case 'cash_entry_created':
    case 'cash_entry_updated':
    case 'cash_entry_deleted': {
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? dash : `${money(i18n.locale).format(amount)} ₴`;
      const accName = asString(c.account_name);
      const account = accName ? fmt(ev.cashAccountSuffix, { name: accName }) : '';
      const description = truncText(c.description, dash);
      const tpl =
        entry.action === 'cash_entry_deleted'
          ? ev.cashEntryDeleted
          : entry.action === 'cash_entry_updated'
            ? ev.cashEntryUpdated
            : asString(c.direction) === 'out'
              ? ev.cashEntryOut
              : ev.cashEntryIn;
      return { actor, text: fmt(tpl, { amount: amountStr, account, description }) };
    }

    // ---------- журнал 2026-07-21: системные настройки ----------
    case 'payroll_rates_changed': {
      const rates = Array.isArray(c.rates) ? (c.rates as Array<Record<string, unknown>>) : [];
      const detail = rates
        .map((r) => {
          const cat = asString(r.category);
          const catLabel =
            cat && cat in CASE_CATEGORY_LABEL
              ? t.enums.caseCategory[cat as CaseCategory]
              : (cat ?? dash);
          return fmt(ev.ratesCategory, {
            category: catLabel,
            lawyerFrom: asNumber(r.lawyer_from) ?? dash,
            lawyerTo: asNumber(r.lawyer_to) ?? dash,
            expertFrom: asNumber(r.expert_from) ?? dash,
            expertTo: asNumber(r.expert_to) ?? dash,
          });
        })
        .join('; ');
      return {
        actor,
        text: detail ? fmt(ev.ratesChanged, { detail }) : t.activity.action.payroll_rates_changed,
      };
    }
    case 'org_requisites_updated': {
      const org = asString(c.org_name);
      return {
        actor,
        text: org ? fmt(ev.requisitesUpdated, { org }) : ev.requisitesUpdatedPlain,
      };
    }

    // ---------- справочник типов дел (2026-07-24) ----------
    case 'case_type_created': {
      const name = asString(c.name) ?? dash;
      return { actor, text: fmt(ev.caseTypeCreated, { name }) };
    }
    case 'case_type_renamed': {
      return {
        actor,
        text: fmt(ev.caseTypeRenamed, {
          from: asString(c.from) ?? dash,
          to: asString(c.to) ?? dash,
        }),
      };
    }
    case 'case_type_activated':
    case 'case_type_deactivated': {
      const name = asString(c.name) ?? dash;
      const verb =
        entry.action === 'case_type_activated'
          ? ev.caseTypeActivated
          : ev.caseTypeDeactivated;
      return { actor, text: fmt(verb, { name }) };
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
