// v3 Сессия 8: текст ежедневного дайджеста задач для Telegram.
//
// Чистая логика (юнит-тестируется): группирует задачи по КИЕВСКИМ датам на
// «просрочено / сегодня / завтра» и форматирует plain-text сообщение. Это
// машинный текст канала, а НЕ UI — поэтому эмодзи и локализация живут здесь,
// а не в i18n-словаре. Plain text (не Markdown) — надёжнее против спецсимволов.

import type { Locale } from '@/lib/i18n/config';
import type { TaskKind } from '@/lib/types/db';
import { kyivToday } from '@/lib/payroll/month';

export type DigestTask = {
  title: string;
  kind: TaskKind;
  due_at: string; // ISO timestamp (UTC)
  caseTitle: string | null; // cases.number_title
};

const KIND_LABEL: Record<Locale, Record<TaskKind, string>> = {
  ru: { task: 'Задача', hearing: 'Заседание', deadline: 'Дедлайн' },
  uk: { task: 'Завдання', hearing: 'Засідання', deadline: 'Дедлайн' },
};

const SECTION: Record<
  Locale,
  { header: string; overdue: string; today: string; tomorrow: string }
> = {
  ru: {
    header: 'Напоминания',
    overdue: '⚠️ Просрочено',
    today: 'Сегодня',
    tomorrow: 'Завтра',
  },
  uk: {
    header: 'Нагадування',
    overdue: '⚠️ Прострочено',
    today: 'Сьогодні',
    tomorrow: 'Завтра',
  },
};

export function taskKindLabel(kind: TaskKind, lang: Locale): string {
  return KIND_LABEL[lang][kind];
}

// Киевская календарная дата (YYYY-MM-DD) произвольного UTC-инстанта.
function kyivDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

// Киевское время HH:mm произвольного UTC-инстанта (24-часовой формат).
function kyivTimeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

// Завтрашняя киевская дата (date-only арифметика над YYYY-MM-DD — без TZ-сдвигов).
function kyivTomorrow(): string {
  const [y, m, d] = kyivToday().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

function formatLine(task: DigestTask, lang: Locale): string {
  const time = kyivTimeOf(task.due_at);
  const kind = taskKindLabel(task.kind, lang);
  const subject = task.caseTitle
    ? `${task.caseTitle} — ${task.title}`
    : task.title;
  return `${time} — ${kind}: ${subject}`;
}

// Текст дайджеста. Разбивка по киевским датам: просрочено (< сегодня) /
// сегодня / завтра; задачи дальше завтрашнего дня не включаются. Если ни в одной
// секции ничего нет — возвращаем '' (вызывающий не отправляет сообщение).
export function buildDigest(tasks: DigestTask[], lang: Locale): string {
  const today = kyivToday();
  const tomorrow = kyivTomorrow();

  const overdue: DigestTask[] = [];
  const todayTasks: DigestTask[] = [];
  const tomorrowTasks: DigestTask[] = [];

  for (const task of tasks) {
    const d = kyivDateOf(task.due_at);
    if (d < today) overdue.push(task);
    else if (d === today) todayTasks.push(task);
    else if (d === tomorrow) tomorrowTasks.push(task);
  }

  if (!overdue.length && !todayTasks.length && !tomorrowTasks.length) return '';

  const byTime = (a: DigestTask, b: DigestTask) => a.due_at.localeCompare(b.due_at);
  const s = SECTION[lang];
  const blocks: string[] = [];
  const pushSection = (heading: string, items: DigestTask[]) => {
    if (!items.length) return;
    const sorted = [...items].sort(byTime);
    blocks.push(`${heading}\n${sorted.map((t) => formatLine(t, lang)).join('\n')}`);
  };

  pushSection(s.overdue, overdue);
  pushSection(s.today, todayTasks);
  pushSection(s.tomorrow, tomorrowTasks);

  return `${s.header}\n\n${blocks.join('\n\n')}`;
}

// ============================================================================
// Просроченные доплаты по делам юриста (v3 Сессия 9). Отдельная секция дайджеста
// для тех, у кого есть просроченные плановые позиции по его делам (lawyer_id).
// ============================================================================
export type OverdueDigestItem = {
  numberTitle: string;
  dueDate: string; // 'YYYY-MM-DD'
  shortfall: number;
};

const OVERDUE_HEADER: Record<Locale, string> = {
  ru: '💰 Просроченные доплаты по вашим делам',
  uk: '💰 Прострочені доплати за вашими справами',
};

const OVERDUE_MONEY: Record<Locale, Intl.NumberFormat> = {
  ru: new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }),
  uk: new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }),
};

// 'YYYY-MM-DD' → 'DD.MM.YYYY' (строковая операция, без Date/TZ).
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

export function buildOverduePaymentsDigest(
  items: OverdueDigestItem[],
  lang: Locale,
): string {
  if (!items.length) return '';
  const money = OVERDUE_MONEY[lang];
  const lines = items.map(
    (i) => `${ddmmyyyy(i.dueDate)} — ${i.numberTitle}: ${money.format(i.shortfall)} ₴`,
  );
  return `${OVERDUE_HEADER[lang]}\n${lines.join('\n')}`;
}
