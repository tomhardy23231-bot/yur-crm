'use client';

import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';
import type { CashAccount } from '@/lib/types/db';

import { CashEntryForm } from './cash-entry-form';

// Ручная операция кассы — кнопка в шапке отчёта + модалка с формой (2026-07-25:
// форма стояла в самом низу страницы, при длинном журнале до неё надо было
// пролистать всё). Счёт активной вкладки предвыбран, его можно сменить в форме.
export function CashEntryDialog({
  accounts,
  accountId,
}: {
  accounts: CashAccount[];
  accountId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        data-tour="cash-add-entry"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border border-border bg-surface px-3 text-[12.5px] font-medium text-text-muted transition-all duration-[200ms] hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
        {t.cash.entry.addIncome}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.cash.entry.headingIncome}
        subtitle={t.cash.entry.incomeSubtitle}
        closeLabel={t.common.close}
      >
        <CashEntryForm accounts={accounts} accountId={accountId} incomeOnly onSuccess={close} />
      </Modal>
    </>
  );
}
