'use client';

import { useState, useTransition } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { backfillCashAction } from '@/lib/cash/actions';
import { useI18n } from '@/lib/i18n/provider';

// Баннер: платежи, внесённые до настройки счетов кассы, не попали в кассу — предлагаем
// синхронизацию (бэкфилл). Рендерится только при count > 0 на странице /reports/cash;
// после успеха revalidatePath обновит count и баннер исчезнет.
// Без единого счёта бэкфилл создать записи не может (cash_resolve_account → NULL,
// «создано 0») — в этом случае кнопку прячем и объясняем порядок действий.
export function CashBackfillBanner({
  count,
  hasAccounts,
}: {
  count: number;
  hasAccounts: boolean;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (count <= 0) return null;

  const runSync = () => {
    setOpen(false);
    startTransition(async () => {
      const result = await backfillCashAction();
      if (result.ok) {
        toast.success(fmt(t.cash.backfill.done, { count: result.count ?? 0 }));
      } else {
        toast.error(result.message ?? t.cash.backfill.failed);
      }
    });
  };

  return (
    // Одна строка (2026-07-25): текст и подсказка встык — баннер не должен
    // отъедать первый экран отчёта.
    <div
      data-tour="cash-sync"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-2"
    >
      <TriangleAlert size={15} strokeWidth={1.75} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-text">
        <span className="font-medium">
          {t.cash.backfill.notice.replace('{count}', String(count))}
        </span>{' '}
        <span className="text-text-muted">
          {hasAccounts ? t.cash.backfill.hint : t.cash.backfill.noAccountsHint}
        </span>
      </p>
      {hasAccounts && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <RefreshCw
            size={13}
            strokeWidth={1.75}
            className={pending ? 'animate-spin' : undefined}
          />
          {pending ? t.cash.backfill.syncing : t.cash.backfill.sync}
        </button>
      )}

      <ConfirmDialog
        open={open}
        title={t.common.confirmTitle}
        description={t.cash.backfill.confirm}
        confirmLabel={t.cash.backfill.sync}
        pending={pending}
        onConfirm={runSync}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
