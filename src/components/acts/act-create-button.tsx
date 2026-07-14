'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';

import { ActCreateForm } from './act-create-form';

// Кнопка «Виписати акт» + модалка с формой (правка владельца 14.07: инлайн-
// форма была размазана по ширине блока). Слушает событие 'casecard:open-act-form'
// — его шлёт быстрое действие «+ Акт» в шапке карточки дела.
export function ActCreateButton({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('casecard:open-act-form', onOpen);
    return () => window.removeEventListener('casecard:open-act-form', onOpen);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary-hover px-3 text-[12px] font-semibold text-primary-fg shadow-brand transition-all hover:-translate-y-px hover:shadow-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Plus size={13} strokeWidth={2.25} />
        {t.acts.block.createSummary}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={t.acts.block.createSummary}
        subtitle={t.acts.create.modalSubtitle}
        closeLabel={t.common.close}
      >
        <ActCreateForm caseId={caseId} onSuccess={close} />
      </Modal>
    </>
  );
}
