'use client';

import { useCallback, useState } from 'react';
import { CheckSquare, CreditCard, FileSpreadsheet, Plus } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { PaymentForm } from '@/components/payments/payment-form';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

// ============================================================================
// Быстрые действия в шапке карточки дела (v3 Сессия 11): «+ Платёж» открывает
// модалку с существующей PaymentForm (второй экземпляр диалога — состояние
// секции «Финансы» не трогаем, после сохранения revalidatePath обновит всё);
// «+ Задача» и «+ Акт» прокручивают к секции и раскрывают её inline-форму
// (details открывается программно, фокус — в первое поле).
// Гейтинг кнопок — тот же, что у форм соответствующих секций (пропсы со страницы).
// ============================================================================

// Переключаем вкладку раздела (CaseTabs слушает 'casecard:tab'), затем — после
// рендера активной панели — раскрываем её inline-форму (details) и ставим фокус.
// tabKey совпадает с id раздела ('tasks' / 'acts'). Smooth уважает
// prefers-reduced-motion.
function scrollToSectionForm(tabKey: string, detailsId: string) {
  window.dispatchEvent(new CustomEvent('casecard:tab', { detail: { key: tabKey } }));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Двойной rAF — дать React отрисовать только что активированную панель.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const details = document.getElementById(detailsId) as HTMLDetailsElement | null;
      if (details) details.open = true;
      details?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      requestAnimationFrame(() =>
        details
          ?.querySelector<HTMLElement>('input, select, textarea')
          ?.focus({ preventScroll: true }),
      );
    }),
  );
}

export function CaseQuickActions({
  caseId,
  canAddPayment,
  canAddTask,
  canAddAct,
}: {
  caseId: string;
  canAddPayment: boolean;
  canAddTask: boolean;
  canAddAct: boolean;
}) {
  const { t } = useI18n();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const closePayment = useCallback(() => setPaymentOpen(false), []);

  if (!canAddPayment && !canAddTask && !canAddAct) return null;

  return (
    <div className="flex items-center gap-1.5 sm:ml-auto">
      {canAddPayment && (
        <QuickButton
          icon={<CreditCard size={14} strokeWidth={1.75} />}
          label={t.caseCard.quickActions.payment}
          onClick={() => setPaymentOpen(true)}
          primary
        />
      )}
      {canAddTask && (
        <QuickButton
          icon={<CheckSquare size={14} strokeWidth={1.75} />}
          label={t.caseCard.quickActions.task}
          onClick={() => scrollToSectionForm('tasks', 'task-create-details')}
        />
      )}
      {canAddAct && (
        <QuickButton
          icon={<FileSpreadsheet size={14} strokeWidth={1.75} />}
          label={t.caseCard.quickActions.act}
          onClick={() => scrollToSectionForm('acts', 'act-create-details')}
        />
      )}

      {canAddPayment && (
        <Modal
          open={paymentOpen}
          onClose={closePayment}
          title={t.payments.addDialog.title}
          subtitle={t.payments.addDialog.subtitle}
          closeLabel={t.payments.addDialog.close}
        >
          <PaymentForm caseId={caseId} onSuccess={closePayment} />
        </Modal>
      )}
    </div>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** Главное действие (каркас): синяя пилюля с бренд-тенью («+ Платёж»). */
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        primary
          ? 'bg-primary-hover text-primary-fg shadow-brand transition-all hover:-translate-y-px hover:shadow-brand-hover'
          : 'border border-border bg-surface text-text-muted transition-colors hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed',
      )}
    >
      <Plus size={12} strokeWidth={2.25} className="-mr-0.5" />
      {icon}
      {label}
    </button>
  );
}
