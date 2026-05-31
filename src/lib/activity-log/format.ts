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
import type { ActivityChanges, ActivityLogEntry } from './queries';

// Карта известных action'ов → русская формулировка для UI.
// Если action неизвестный — выводим сам action в monospace, чтобы было видно
// что в журнал прилетело что-то новое (а не сломать рендер).

const MONEY = new Intl.NumberFormat('ru-RU', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

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
function resolveId(value: unknown, nameById?: NameById): string {
  const s = asString(value);
  if (!s) return '—';
  const name = nameById?.get(s);
  if (name) return name;
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

// Локализация значения поля для человекочитаемого diff'a (case.stage = 'pretrial' → «Досудебное»).
function localizeFieldValue(
  field: string,
  value: unknown,
  nameById?: NameById,
): string {
  if (value === null || value === undefined) return '—';

  // id-поля (смена юриста/Експерта/исполнителя/клиента) → имя вместо UUID.
  if (USER_ID_FIELDS.has(field) || CLIENT_ID_FIELDS.has(field)) {
    return resolveId(value, nameById);
  }

  switch (field) {
    case 'stage': {
      const s = asString(value);
      return s && s in CASE_STAGE_LABEL
        ? CASE_STAGE_LABEL[s as CaseStage]
        : String(value);
    }
    case 'case_type': {
      const s = asString(value);
      return s && s in CASE_TYPE_LABEL
        ? CASE_TYPE_LABEL[s as CaseType]
        : String(value);
    }
    case 'category': {
      const s = asString(value);
      return s && s in CASE_CATEGORY_LABEL
        ? CASE_CATEGORY_LABEL[s as CaseCategory]
        : String(value);
    }
    case 'source': {
      const s = asString(value);
      return s && s in CLIENT_SOURCE_LABEL
        ? CLIENT_SOURCE_LABEL[s as ClientSource]
        : String(value);
    }
    case 'priority': {
      const s = asString(value);
      return s && s in CASE_PRIORITY_LABEL
        ? CASE_PRIORITY_LABEL[s as CasePriority]
        : String(value);
    }
    case 'kind': {
      const s = asString(value);
      return s && s in TASK_KIND_LABEL
        ? TASK_KIND_LABEL[s as TaskKind]
        : String(value);
    }
    case 'doc_type': {
      const s = asString(value);
      return s && s in DOC_TYPE_LABEL
        ? DOC_TYPE_LABEL[s as DocType]
        : String(value);
    }
    case 'contract_sum':
    case 'amount': {
      const n = asNumber(value);
      return n === null ? String(value) : `${MONEY.format(n)} ₴`;
    }
    case 'opened_at':
    case 'paid_at':
    case 'closed_at': {
      const s = asString(value);
      return s ?? String(value);
    }
    case 'due_at': {
      const s = asString(value);
      if (!s) return '—';
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : DATE_TIME.format(d);
    }
    case 'tags':
    case 'billing_types': {
      const arr = asArray(value);
      return arr && arr.length > 0 ? arr.join(', ') : '—';
    }
    default: {
      const s = asString(value);
      return s ?? JSON.stringify(value);
    }
  }
}

const FIELD_LABEL: Record<string, string> = {
  number_title: 'номер/название',
  client_id: 'клиента',
  lawyer_id: 'юриста (договор)',
  responsible_id: 'Експерта',
  opened_at: 'дату открытия',
  case_type: 'тип дела',
  category: 'категорию',
  subject: 'предмет договора',
  stage: 'этап',
  priority: 'приоритет',
  contract_sum: 'сумму договора',
  billing_types: 'тип оплаты',
  opponent: 'оппонента',
  court_case_number: 'номер суддела',
  court: 'суд',
  tags: 'теги',
  // clients
  source: 'источник',
  // tasks
  title: 'название',
  kind: 'тип',
  assignee_id: 'исполнителя',
  due_at: 'срок',
  description: 'описание',
};

function formatDiff(changes: ActivityChanges | null, nameById?: NameById): string {
  if (!changes) return '';
  const diff = (changes as Record<string, unknown>).diff;
  if (!diff || typeof diff !== 'object') return '';
  const entries = Object.entries(diff as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([field, val]) => {
      const v = val as { from?: unknown; to?: unknown };
      const label = FIELD_LABEL[field] ?? field;
      return `${label}: ${localizeFieldValue(field, v.from, nameById)} → ${localizeFieldValue(field, v.to, nameById)}`;
    })
    .join(', ');
}

// Человекочитаемые подписи всех action-кодов (allowlist + триггерные + user-*).
// Используется как fallback в default-ветке formatActivity — чтобы в журнал не
// просачивались сырые коды вроде «payroll_reverted». Конкретные ветки switch
// дают более богатый текст (с суммами/именами); карта закрывает остальное.
export const ACTION_LABEL: Record<string, string> = {
  case_created: 'создал(а) дело',
  case_updated: 'обновил(а) дело',
  case_deleted: 'удалил(а) дело',
  stage_corrected: 'скорректировал(а) этап',
  client_created: 'создал(а) клиента',
  client_updated: 'обновил(а) клиента',
  client_deleted: 'удалил(а) клиента',
  document_uploaded: 'загрузил(а) документ',
  document_deleted: 'удалил(а) документ',
  payment_created: 'добавил(а) платёж',
  payment_deleted: 'удалил(а) платёж',
  task_created: 'создал(а) задачу',
  task_updated: 'обновил(а) задачу',
  task_toggled: 'переключил(а) статус задачи',
  task_deleted: 'удалил(а) задачу',
  payroll_paid: 'отметил(а) выплату зарплаты',
  payroll_reverted: 'откатил(а) выплату зарплаты',
  user_created: 'создал(а) пользователя',
  user_role_changed: 'изменил(а) роль пользователя',
  user_deactivated: 'деактивировал(а) пользователя',
  user_reactivated: 'реактивировал(а) пользователя',
};

const ROLE_IN_CASE_LABEL: Record<string, string> = {
  lawyer: 'Юрист',
  expert: 'Эксперт',
};

export type FormattedActivity = {
  // Сам action'ный «глагол» (текст события).
  text: string;
  // ФИО автора события (или «Система», если user_id=null — service_role).
  actor: string;
};

export function formatActivity(
  entry: ActivityLogEntry,
  nameById?: NameById,
): FormattedActivity {
  const actor = entry.user?.full_name ?? 'Система';
  const changes = entry.changes ?? {};
  const c = changes as Record<string, unknown>;

  switch (entry.action) {
    // ---------- cases ----------
    case 'case_created':
      return { actor, text: 'создал(а) дело' };
    case 'case_updated': {
      const detail = formatDiff(changes, nameById);
      return { actor, text: detail ? `изменил(а) ${detail}` : 'обновил(а) дело' };
    }
    case 'case_deleted':
      return { actor, text: 'удалил(а) дело' };
    case 'stage_corrected': {
      const from = asString(c.from);
      const to = asString(c.to);
      const fromLabel = from && from in CASE_STAGE_LABEL ? CASE_STAGE_LABEL[from as CaseStage] : (from ?? '—');
      const toLabel = to && to in CASE_STAGE_LABEL ? CASE_STAGE_LABEL[to as CaseStage] : (to ?? '—');
      return { actor, text: `откатил(а) этап: ${fromLabel} → ${toLabel}` };
    }

    // ---------- documents ----------
    case 'document_uploaded': {
      const name = asString(c.file_name) ?? '—';
      const type = asString(c.doc_type);
      const typeLabel = type && type in DOC_TYPE_LABEL ? DOC_TYPE_LABEL[type as DocType] : null;
      return {
        actor,
        text: typeLabel
          ? `загрузил(а) документ «${name}» (${typeLabel})`
          : `загрузил(а) документ «${name}»`,
      };
    }
    case 'document_deleted': {
      const name = asString(c.file_name) ?? '—';
      return { actor, text: `удалил(а) документ «${name}»` };
    }

    // ---------- payments ----------
    case 'payment_created': {
      const amount = asNumber(c.amount);
      const paidAt = asString(c.paid_at);
      const method = asString(c.method);
      const amountStr = amount === null ? '—' : `${MONEY.format(amount)} ₴`;
      const parts = [`платёж ${amountStr}`];
      if (paidAt) parts.push(`от ${paidAt}`);
      if (method) parts.push(`(${method})`);
      return { actor, text: `добавил(а) ${parts.join(' ')}` };
    }
    case 'payment_deleted': {
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? '—' : `${MONEY.format(amount)} ₴`;
      return { actor, text: `удалил(а) платёж ${amountStr}` };
    }

    // ---------- tasks ----------
    case 'task_created': {
      const title = asString(c.title) ?? '—';
      const kind = asString(c.kind);
      // Винительный падеж: задачу/заседание/дедлайн (TASK_KIND_LABEL — именительный).
      const acc =
        kind === 'task' ? 'задачу'
        : kind === 'hearing' ? 'заседание'
        : kind === 'deadline' ? 'дедлайн'
        : 'задачу';
      return { actor, text: `создал(а) ${acc} «${title}»` };
    }
    case 'task_updated': {
      const detail = formatDiff(changes, nameById);
      const title = asString(c.title);
      const suffix = title ? ` «${title}»` : '';
      return {
        actor,
        text: detail ? `изменил(а) задачу${suffix}: ${detail}` : `обновил(а) задачу${suffix}`,
      };
    }
    case 'task_toggled': {
      const status = asString(c.status);
      const title = asString(c.title);
      const suffix = title ? ` «${title}»` : '';
      if (status === 'done') return { actor, text: `завершил(а) задачу${suffix}` };
      if (status === 'open') return { actor, text: `открыл(а) задачу${suffix} заново` };
      return { actor, text: `переключил(а) статус задачи${suffix}` };
    }
    case 'task_deleted': {
      const title = asString(c.title) ?? '—';
      return { actor, text: `удалил(а) задачу «${title}»` };
    }

    // ---------- payroll (леджер выплат) ----------
    case 'payroll_paid':
    case 'payroll_reverted': {
      const role = asString(c.role_in_case);
      const roleLabel = role ? (ROLE_IN_CASE_LABEL[role] ?? role) : null;
      const who = resolveId(c.user_id, nameById);
      const amount = asNumber(c.amount);
      const amountStr = amount === null ? null : `${MONEY.format(amount)} ₴`;
      // «Юрист Иванов — 2 500 ₴» (части, которых нет, опускаем).
      const parts = [roleLabel, who].filter(Boolean).join(' ');
      const tail = [parts, amountStr].filter(Boolean).join(' — ');
      const verb =
        entry.action === 'payroll_paid'
          ? 'отметил(а) выплату зарплаты'
          : 'откатил(а) выплату зарплаты';
      return { actor, text: tail ? `${verb}: ${tail}` : verb };
    }

    default:
      // Неизвестный/новый action — берём подпись из карты, иначе показываем код
      // (видно, что в журнал прилетело что-то новое, а не ломаем рендер).
      return { actor, text: ACTION_LABEL[entry.action] ?? `действие: ${entry.action}` };
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
export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffDays = Math.round(diffH / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;
  return DATE_TIME.format(d);
}
