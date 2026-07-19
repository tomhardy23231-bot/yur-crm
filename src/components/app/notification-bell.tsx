'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  loadNotificationsAction,
  markNotificationsSeenAction,
  type NotificationsPayload,
} from '@/lib/notifications/actions';
import { useI18n } from '@/lib/i18n/provider';
import { cn, formatMoney } from '@/lib/utils';

// Колокольчик топбара (2026-07-19): вместо перехода на /tasks — попап с
// уведомлениями (просроченные задачи, задачи на сегодня, просроченные платежи
// по графику). Содержимое грузится лениво при открытии; открытие пишет отметку
// «просмотрено» (markNotificationsSeenAction) — бейдж гаснет и не возвращается,
// пока не появится более свежее событие (lib/notifications/queries.ts).

const DATE_TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kyiv',
});

// 'YYYY-MM-DD' → 'DD.MM' (дата плановой доплаты).
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function NotificationBell({
  tasksOverdue,
  tasksToday,
  unseen,
}: {
  /** Просроченные открытые задачи пользователя (due_at < now). */
  tasksOverdue: number;
  /** Открытые задачи со сроком сегодня по Киеву. */
  tasksToday: number;
  /** Есть события новее последнего просмотра — показать бейдж. */
  unseen: boolean;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [seenLocally, setSeenLocally] = useState(false);
  const [data, setData] = useState<NotificationsPayload | null>(null);
  const [loading, startLoading] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Закрытие по клику вне и по Escape (фокус возвращаем на кнопку).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Просмотр: бейдж гасим сразу, отметку пишем в фоне; список — лениво.
    setSeenLocally(true);
    startLoading(async () => {
      const [payload] = await Promise.all([
        loadNotificationsAction(),
        markNotificationsSeenAction(),
      ]);
      setData(payload);
    });
  };

  const close = () => setOpen(false);

  const dueTotal = tasksOverdue + tasksToday;
  const showBadge = unseen && !seenLocally && dueTotal > 0;
  const ariaLabel =
    dueTotal > 0
      ? fmt(t.topbar.notificationsDue, {
          overdue: tasksOverdue,
          today: tasksToday,
        })
      : t.topbar.notificationsAria;

  const empty =
    data !== null &&
    data.overdue.length === 0 &&
    data.today.length === 0 &&
    data.payments.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed"
      >
        <Bell size={18} strokeWidth={1.9} />
        {showBadge && (
          <span
            className={`absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none tabular-nums text-white ${
              tasksOverdue > 0 ? 'bg-error' : 'bg-primary'
            }`}
          >
            {dueTotal > 9 ? '9+' : dueTotal}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t.topbar.notifTitle}
          className={cn(
            'absolute right-0 top-[calc(100%+8px)] z-30',
            // 5rem — запас на отступ колокольчика от правого края экрана,
            // чтобы на мобильных попап не вылезал за левый край.
            'w-[min(34rem,calc(100vw-5rem))]',
            'rounded-xl border border-border bg-surface shadow-lg shadow-black/10',
            'origin-top-right animate-[stage-menu-in_140ms_ease-out]',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-text">
              {t.topbar.notifTitle}
            </span>
            <Link
              href="/tasks"
              onClick={close}
              className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {t.topbar.notifAllTasks} →
            </Link>
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-1.5">
            {loading && !data && (
              <div className="flex flex-col gap-1.5 p-2" aria-hidden="true">
                <span className="h-9 animate-pulse rounded-lg bg-surface-sunken" />
                <span className="h-9 animate-pulse rounded-lg bg-surface-sunken" />
                <span className="h-9 animate-pulse rounded-lg bg-surface-sunken" />
              </div>
            )}

            {empty && (
              <p className="px-2.5 py-4 text-center text-[12.5px] text-text-muted">
                {t.topbar.notifEmpty}
              </p>
            )}

            {data !== null && data.overdue.length > 0 && (
              <NotifSection title={t.topbar.notifOverdue} tone="error">
                {data.overdue.map((task) => (
                  <NotifRow
                    key={task.id}
                    href={task.caseId ? `/cases/${task.caseId}` : '/tasks'}
                    onNavigate={close}
                    title={task.title}
                    sub={`${task.caseTitle ?? t.topbar.notifNoCase}${
                      task.dueAt
                        ? ` · ${DATE_TIME_FMT.format(new Date(task.dueAt))}`
                        : ''
                    }`}
                    tone="error"
                  />
                ))}
              </NotifSection>
            )}

            {data !== null && data.today.length > 0 && (
              <NotifSection title={t.topbar.notifToday} tone="primary">
                {data.today.map((task) => (
                  <NotifRow
                    key={task.id}
                    href={task.caseId ? `/cases/${task.caseId}` : '/tasks'}
                    onNavigate={close}
                    title={task.title}
                    sub={`${task.caseTitle ?? t.topbar.notifNoCase}${
                      task.dueAt
                        ? ` · ${DATE_TIME_FMT.format(new Date(task.dueAt))}`
                        : ''
                    }`}
                    tone="primary"
                  />
                ))}
              </NotifSection>
            )}

            {data !== null && data.payments.length > 0 && (
              <NotifSection title={t.topbar.notifPayments} tone="warning">
                {data.payments.map((p) => (
                  <NotifRow
                    key={`${p.caseId}-${p.dueDate}`}
                    href={`/cases/${p.caseId}`}
                    onNavigate={close}
                    title={p.numberTitle}
                    sub={fmt(t.topbar.notifPaymentLine, {
                      amount: formatMoney(p.shortfall),
                      date: shortDate(p.dueDate),
                    })}
                    tone="warning"
                  />
                ))}
              </NotifSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_DOT: Record<'error' | 'primary' | 'warning', string> = {
  error: 'bg-error',
  primary: 'bg-primary',
  warning: 'bg-warning',
};

function NotifSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'error' | 'primary' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <section className="py-1 first:pt-0.5">
      <h3 className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-subtle">
        <span
          className={cn('inline-flex h-1.5 w-1.5 rounded-full', TONE_DOT[tone])}
        />
        {title}
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function NotifRow({
  href,
  title,
  sub,
  tone,
  onNavigate,
}: {
  href: string;
  title: string;
  sub: string;
  tone: 'error' | 'primary' | 'warning';
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex flex-col gap-0.5 rounded-lg px-2.5 py-2',
          'transition-colors hover:bg-surface-sunken',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
        )}
      >
        <span className="truncate text-[12.5px] font-medium leading-tight text-text">
          {title}
        </span>
        <span
          className={cn(
            'truncate text-[11.5px] leading-tight',
            tone === 'error' ? 'text-error-text' : 'text-text-muted',
          )}
        >
          {sub}
        </span>
      </Link>
    </li>
  );
}
