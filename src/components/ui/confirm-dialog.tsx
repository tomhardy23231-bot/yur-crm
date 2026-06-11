'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/lib/i18n/provider';

interface ConfirmDialogProps {
  open: boolean;
  /** Заголовок диалога (по месту — обычно t.common.confirmTitle). */
  title: string;
  /** Поясняющий текст под заголовком (старая строка из window.confirm). */
  description?: string;
  /** Доп. содержимое между описанием и кнопками (напр. textarea причины). */
  children?: ReactNode;
  /** Подпись кнопки подтверждения (по месту: «Удалить», «Синхронизировать»…). */
  confirmLabel: string;
  /** Подпись кнопки отмены. По умолчанию — t.common.cancel. */
  cancelLabel?: string;
  /** 'danger' — красная кнопка подтверждения (деструктив). */
  tone?: 'danger' | 'default';
  /** Действие выполняется — блокируем обе кнопки. */
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// Доступный диалог подтверждения деструктивных/значимых действий — замена голому
// window.confirm (Сессия 5). Esc/фокус-трап/возврат фокуса — из ui/modal.tsx.
// Кнопка отмены идёт первой (получает фокус при открытии), деструктивное действие
// требует явного клика по красной кнопке.
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={t.common.close}
      className="w-[min(440px,95vw)]"
    >
      {description && (
        <p className="text-[13.5px] leading-relaxed text-text-muted">
          {description}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={pending}
        >
          {cancelLabel ?? t.common.cancel}
        </Button>
        <Button
          type="button"
          variant={tone === 'danger' ? 'destructive' : 'primary'}
          size="sm"
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
