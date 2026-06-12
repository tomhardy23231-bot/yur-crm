import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  ListChecks,
  TriangleAlert,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { cn, formatMoney, nowMs } from '@/lib/utils';
import { kyivToday } from '@/lib/payroll/month';
import { listTasksByCase } from '@/lib/tasks/queries';
import { listPlanItems } from '@/lib/payments/queries';
import { planWithStatuses } from '@/lib/payments/plan';
import type { CaseStage } from '@/lib/types/db';

// Блок «Що далі» (редизайн Волна 1): отвечает на главный вопрос юриста — «что
// делать с делом прямо сейчас». Сводит просроченные задачи, ближайшее
// заседание/задачу и доплаты по графику в один список приоритетных строк.
// Серверный компонент: переиспользует существующие запросы (задачи + график
// платежей), без новых функций БД. Закрытые дела блок не показывает (page-гейт).

const DT_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});
const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
// День в киевском поясе (YYYY-MM-DD) — чтобы «сегодня» совпадало с kyivToday().
const KYIV_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DT_FMT.format(d);
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : TIME_FMT.format(d);
}
function fmtPlanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

type Tone = 'error' | 'warning' | 'info' | 'muted';
const TONE_TEXT: Record<Tone, string> = {
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
  muted: 'text-text-subtle',
};

interface CaseNextActionsProps {
  caseId: string;
  /** cases.paid_total — база накопительного покрытия графика. */
  paidTotal: number;
  /** cases.debt — для подсказки «график не задан». */
  debt: number;
  /** Есть ли подписанный акт (для мягкого предупреждения). */
  hasAct: boolean;
  stage: CaseStage;
}

export async function CaseNextActions({
  caseId,
  paidTotal,
  debt,
  hasAct,
  stage,
}: CaseNextActionsProps) {
  const { t, fmt, plural } = await getT();
  const w = t.caseCard.whatsNext;

  const [tasks, planItems] = await Promise.all([
    listTasksByCase(caseId),
    listPlanItems(caseId),
  ]);

  const now = nowMs();
  const today = kyivToday();

  const openDue = tasks.filter((tk) => tk.status === 'open' && tk.due_at != null);
  const overdue = openDue.filter(
    (tk) => new Date(tk.due_at as string).getTime() < now,
  );
  const nextTask =
    openDue
      .filter((tk) => new Date(tk.due_at as string).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.due_at as string).getTime() -
          new Date(b.due_at as string).getTime(),
      )[0] ?? null;

  const statuses = planWithStatuses(
    planItems.map((i) => ({
      id: i.id,
      due_date: i.due_date,
      amount: i.amount,
      created_at: i.created_at,
    })),
    paidTotal,
    today,
  );
  const planById = new Map(planItems.map((i) => [i.id, i]));
  const overduePlan = statuses.find((s) => s.status === 'overdue');
  const nextPlan = statuses.find((s) => s.status === 'pending');
  const overduePlanItem = overduePlan ? planById.get(overduePlan.id) : null;
  const nextPlanItem = nextPlan ? planById.get(nextPlan.id) : null;

  // Предупреждение «нет акта» — когда дело на финишной прямой (ожидание решения).
  const missingActWarn = !hasAct && stage === 'awaiting_decision';

  type Row = {
    key: string;
    icon: ReactNode;
    tone: Tone;
    text: ReactNode;
    cta?: { href: string; label: string };
  };
  const rows: Row[] = [];

  if (overdue.length > 0) {
    rows.push({
      key: 'overdue-tasks',
      tone: 'error',
      icon: <TriangleAlert size={18} strokeWidth={1.75} />,
      text: (
        <>
          <span className="font-medium text-error">
            {plural(w.overdueTasks, overdue.length)}
          </span>
          <span className="text-text-muted"> — {overdue[0]?.title}</span>
        </>
      ),
    });
  }

  if (nextTask) {
    const dueIso = nextTask.due_at as string;
    const isToday = KYIV_DAY.format(new Date(dueIso)) === today;
    const when = isToday ? `${w.dueToday}, ${fmtTime(dueIso)}` : fmtDateTime(dueIso);
    rows.push({
      key: 'next-task',
      tone: isToday ? 'warning' : 'muted',
      icon: <CalendarClock size={18} strokeWidth={1.75} />,
      text: (
        <>
          <span className="text-text-muted">{w.nextLabel}: </span>
          <span className="font-medium text-text">{nextTask.title}</span>
          {' · '}
          <span
            className={cn(
              'tabular-nums',
              isToday ? 'font-medium text-warning' : 'text-text-muted',
            )}
          >
            {when}
          </span>
          {nextTask.assignee?.full_name && (
            <span className="text-text-subtle"> · {nextTask.assignee.full_name}</span>
          )}
        </>
      ),
    });
  }

  if (overduePlanItem) {
    rows.push({
      key: 'plan-overdue',
      tone: 'error',
      icon: <Banknote size={18} strokeWidth={1.75} />,
      text: (
        <span className="font-medium text-error">
          {fmt(w.planOverdue, {
            amount: formatMoney(overduePlanItem.amount),
            date: fmtPlanDate(overduePlanItem.due_date),
          })}
        </span>
      ),
    });
  } else if (nextPlanItem) {
    rows.push({
      key: 'plan-next',
      tone: 'info',
      icon: <Banknote size={18} strokeWidth={1.75} />,
      text: fmt(w.planNext, {
        amount: formatMoney(nextPlanItem.amount),
        date: fmtPlanDate(nextPlanItem.due_date),
      }),
    });
  } else if (debt > 0) {
    rows.push({
      key: 'debt-no-plan',
      tone: 'info',
      icon: <Banknote size={18} strokeWidth={1.75} />,
      text: fmt(w.debtNoPlan, { amount: formatMoney(debt) }),
      cta: { href: '#plan', label: w.addPlan },
    });
  }

  if (missingActWarn) {
    rows.push({
      key: 'missing-act',
      tone: 'warning',
      icon: <FileWarning size={18} strokeWidth={1.75} />,
      text: <span className="text-text-muted">{w.missingAct}</span>,
    });
  }

  if (rows.length === 0) {
    rows.push({
      key: 'all-clear',
      tone: 'muted',
      icon: <CheckCircle2 size={18} strokeWidth={1.75} />,
      text: <span className="text-text-muted">{w.allClear}</span>,
    });
  }

  return (
    <Card className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks size={16} strokeWidth={1.75} className="text-text-muted" />
        <h2 className="text-[16px] font-semibold text-text">{w.heading}</h2>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5 text-[13px]">
            <span className={cn('shrink-0', TONE_TEXT[r.tone])}>{r.icon}</span>
            <span className="min-w-0 flex-1">{r.text}</span>
            {r.cta && (
              <Link
                href={r.cta.href}
                className="shrink-0 rounded-control border border-border px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:border-primary-border hover:bg-primary-subtle/50"
              >
                {r.cta.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
