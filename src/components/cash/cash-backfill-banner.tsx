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
export function CashBackfillBanner({ count }: { count: number }) {
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3">
      <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text">
          {t.cash.backfill.notice.replace('{count}', String(count))}
        </p>
        <p className="text-[12px] text-text-muted">{t.cash.backfill.hint}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        <RefreshCw
          size={14}
          strokeWidth={1.75}
          className={pending ? 'animate-spin' : undefined}
        />
        {pending ? t.cash.backfill.syncing : t.cash.backfill.sync}
      </button>

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
