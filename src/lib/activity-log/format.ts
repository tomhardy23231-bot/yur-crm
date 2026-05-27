import {
  CASE_STAGE_LABEL,
  CASE_TYPE_LABEL,
  CASE_PRIORITY_LABEL,
  TASK_KIND_LABEL,
  DOC_TYPE_LABEL,
  type CaseStage,
  type CaseType,
  type CasePriority,
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

// Локализация значения поля для человекочитаемого diff'a (case.stage = 'pretrial' → «Досудебное»).
function localizeFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';

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
  responsible_id: 'ответственного',
  opened_at: 'дату открытия',
  case_type: 'тип дела',
  stage: 'этап',
  priority: 'приоритет',
  contract_sum: 'сумму договора',
  billing_types: 'тип оплаты',
  opponent: 'оппонента',
  court_case_number: 'номер суддела',
  court: 'суд',
  tags: 'теги',
  // tasks
  title: 'название',
  kind: 'тип',
  assignee_id: 'исполнителя',
  due_at: 'срок',
  description: 'описание',
};

function formatDiff(changes: ActivityChanges | null): string {
  if (!changes) return '';
  const diff = (changes as Record<string, unknown>).diff;
  if (!diff || typeof diff !== 'object') return '';
  const entries = Object.entries(diff as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([field, val]) => {
      const v = val as { from?: unknown; to?: unknown };
      const label = FIELD_LABEL[field] ?? field;
      return `${label}: ${localizeFieldValue(field, v.from)} → ${localizeFieldValue(field, v.to)}`;
    })
    .join(', ');
}

export type FormattedActivity = {
  // Сам action'ный «глагол» (текст события).
  text: string;
  // ФИО автора события (или «Система», если user_id=null — service_role).
  actor: string;
};

export function formatActivity(entry: ActivityLogEntry): FormattedActivity {
  const actor = entry.user?.full_name ?? 'Система';
  const changes = entry.changes ?? {};
  const c = changes as Record<string, unknown>;

  switch (entry.action) {
    // ---------- cases ----------
    case 'case_created':
      return { actor, text: 'создал(а) дело' };
    case 'case_updated': {
      const detail = formatDiff(changes);
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
      const detail = formatDiff(changes);
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

    default:
      return { actor, text: `действие: ${entry.action}` };
  }
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
