'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { closeCaseLostAction } from '@/lib/cases/actions';
import { useI18n } from '@/lib/i18n/provider';

// Кнопка «Не заключили» (v3 Сессия 7) — рядом с этап-дропдауном на этапах
// new_request|consultation. Клик → ConfirmDialog с textarea «Причина»
// (необязательно) → closeCaseLostAction (RPC close_case_lost: stage→closed,
// outcome=lost). НЕ блокирующее действие, но необратимое для воронки — danger-тон.
export function MarkLostButton({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await closeCaseLostAction(caseId, reason);
      if (res.ok) {
        setOpen(false);
        setReason('');
        router.refresh();
      } else {
        setError(res.message ?? t.cases.lost.errorFailed);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="gap-1.5 border border-error/20 text-error/80 hover:bg-error-bg hover:text-error"
      >
        <Ban size={13} strokeWidth={2} aria-hidden="true" />
        {t.cases.lost.button}
      </Button>

      <ConfirmDialog
        open={open}
        title={t.cases.lost.confirmTitle}
        description={t.cases.lost.confirmDescription}
        confirmLabel={t.cases.lost.confirmLabel}
        tone="danger"
        pending={pending}
        onConfirm={handleConfirm}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          setError(null);
        }}
      >
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          rows={3}
          maxLength={500}
          placeholder={t.cases.lost.reasonPlaceholder}
          aria-label={t.cases.lost.reasonLabel}
        />
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] text-error">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
