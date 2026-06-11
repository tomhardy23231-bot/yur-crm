'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Link2,
  Loader2,
  Send,
  Unlink,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import {
  linkTelegramAction,
  reissueCalendarTokenAction,
  unlinkTelegramAction,
} from '@/lib/notifications/actions';
import type { NotifyChannel } from '@/lib/notifications/queries';

// v3 Сессия 8: блок профиля «Уведомления и календарь».
// Telegram — привязка по одноразовому коду (chat_id впишет вебхук).
// Календарь — ссылка-подписка ICS (URL = аутентификация); перевыпуск в БД.
export function NotificationsCard({
  channel,
  botName,
}: {
  channel: NotifyChannel | null;
  botName: string | null;
}) {
  const { t } = useI18n();
  const tn = t.account.notifications;

  const [linked, setLinked] = useState(!!channel?.telegram_chat_id);
  const [code, setCode] = useState<string | null>(
    channel?.telegram_link_code ?? null,
  );
  const [token, setToken] = useState<string | null>(
    channel?.calendar_token ?? null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<'tg' | 'cal' | null>(null);
  const [pending, startTransition] = useTransition();
  const feedInputRef = useRef<HTMLInputElement>(null);

  // Абсолютный URL фида собирается только на клиенте (window.location.origin).
  // Пишем его в input ИМПЕРАТИВНО через ref — без setState в эффекте (иначе
  // каскадные ре-рендеры; SSR показывает относительный путь, без рассинхрона).
  useEffect(() => {
    if (token && feedInputRef.current) {
      feedInputRef.current.value = `${window.location.origin}/api/calendar/${token}.ics`;
    }
  }, [token]);

  function doLink() {
    setError(null);
    startTransition(async () => {
      const res = await linkTelegramAction();
      if (res.ok && res.code) setCode(res.code);
      else setError('tg');
    });
  }

  function doUnlink() {
    setError(null);
    startTransition(async () => {
      const res = await unlinkTelegramAction();
      if (res.ok) {
        setLinked(false);
        setCode(null);
      } else {
        setError('tg');
      }
    });
  }

  function doReissue() {
    setError(null);
    startTransition(async () => {
      const res = await reissueCalendarTokenAction();
      if (res.ok && res.token) setToken(res.token);
      else setError('cal');
    });
  }

  async function copyFeed() {
    const url = token ? `${window.location.origin}/api/calendar/${token}.ics` : '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен — пользователь скопирует вручную */
    }
  }

  return (
    <div className="flex flex-col">
      {/* Telegram */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Send size={15} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-[14px] font-semibold text-text">
            {tn.telegram.title}
          </h3>
          {linked && <Badge tone="success">{tn.telegram.linkedBadge}</Badge>}
        </div>
        <p className="text-[13px] text-text-muted">{tn.telegram.hint}</p>

        {linked ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={doUnlink}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} strokeWidth={1.75} />
              )}
              {tn.telegram.unlink}
            </Button>
          </div>
        ) : code ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3">
            {botName && (
              <p className="text-[13px] text-text-muted">
                {tn.telegram.openBot}{' '}
                <span className="font-medium text-text">@{botName}</span>
              </p>
            )}
            <p className="text-[13px] text-text-muted">
              {tn.telegram.instruction}
            </p>
            <code className="w-fit rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[13px] text-text">
              /start {code}
            </code>
            <p className="text-[12px] text-text-subtle">{tn.telegram.codeHint}</p>
            <button
              type="button"
              onClick={doLink}
              disabled={pending}
              className="w-fit text-[12.5px] font-medium text-primary hover:underline disabled:opacity-60"
            >
              {tn.telegram.regenerate}
            </button>
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={doLink}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link2 size={14} strokeWidth={1.75} />
              )}
              {tn.telegram.link}
            </Button>
          </div>
        )}
        {error === 'tg' && (
          <p role="alert" className="text-[12.5px] text-error">
            {tn.telegram.error}
          </p>
        )}
      </div>

      <div className="my-4 h-px bg-border" />

      {/* Календарь (ICS) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} strokeWidth={1.75} className="text-text-muted" />
          <h3 className="text-[14px] font-semibold text-text">
            {tn.calendar.title}
          </h3>
        </div>
        <p className="text-[13px] text-text-muted">{tn.calendar.hint}</p>

        {token ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={feedInputRef}
                readOnly
                defaultValue={`/api/calendar/${token}.ics`}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-sunken px-2.5 py-1.5 font-mono text-[12px] text-text-muted"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={copyFeed}
                className="shrink-0 gap-1.5"
              >
                {copied ? (
                  <Check size={14} strokeWidth={2} className="text-success" />
                ) : (
                  <Copy size={14} strokeWidth={1.75} />
                )}
                {copied ? tn.calendar.copied : tn.calendar.copy}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={doReissue}
                disabled={pending}
                className="gap-1.5"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                {tn.calendar.reissue}
              </Button>
              <span className="text-[12px] text-text-subtle">
                {tn.calendar.reissueHint}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={doReissue}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CalendarClock size={14} strokeWidth={1.75} />
              )}
              {tn.calendar.create}
            </Button>
          </div>
        )}
        {error === 'cal' && (
          <p role="alert" className="text-[12.5px] text-error">
            {tn.calendar.error}
          </p>
        )}
      </div>
    </div>
  );
}
