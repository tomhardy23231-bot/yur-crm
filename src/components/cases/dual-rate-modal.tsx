'use client';

import { useActionState, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  setCaseDualRateAction,
  type DualRateActionState,
} from '@/lib/cases/actions';
import { formatPercent } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';

const INITIAL: DualRateActionState = { ok: false };

// Модалка «ставка при совмещении ролей» (0007): юрист и Експерт дела — один
// человек, а единый % ещё не назначен. Сервер рендерит компонент ТОЛЬКО когда
// это так (и у зрителя есть право edit_rate_overrides), поэтому здесь без
// дополнительных проверок: показать при заходе, дать пресеты ставок ролей и
// ручной ввод. «Позже» — закрыть без сохранения (при следующем открытии
// карточки вопрос повторится; после сохранения — больше не всплывает).
export function DualRateModal({
  caseId,
  personName,
  lawyerPercent,
  expertPercent,
}: {
  caseId: string;
  personName: string;
  // Эффективные ставки ролей (override ?? ставка категории) — для пресетов.
  lawyerPercent: number;
  expertPercent: number;
}) {
  const { t, fmt } = useI18n();
  const d = t.caseCard.dualRate;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(
    String(Math.max(lawyerPercent, expertPercent)),
  );
  const [state, formAction, pending] = useActionState(
    setCaseDualRateAction.bind(null, caseId),
    INITIAL,
  );

  // Небольшая задержка показа — карточка успевает отрисоваться (как онбординг).
  useEffect(() => {
    const id = setTimeout(() => setOpen(true), 350);
    return () => clearTimeout(id);
  }, []);

  // Успешное сохранение закрывает модалку производным состоянием (revalidatePath
  // уже обновил серверные данные; при следующем заходе сервер её не отрендерит).
  const visible = open && !state.ok;
  if (!visible) return null;

  // Пресеты без дубля: при равных ставках ролей достаточно одной кнопки.
  const presets: Array<{ label: string; percent: number }> = [
    { label: fmt(d.presetLawyer, { percent: formatPercent(lawyerPercent) }), percent: lawyerPercent },
  ];
  if (expertPercent !== lawyerPercent) {
    presets.push({
      label: fmt(d.presetExpert, { percent: formatPercent(expertPercent) }),
      percent: expertPercent,
    });
  }

  return (
    <Modal
      open={visible}
      onClose={() => setOpen(false)}
      title={d.title}
      subtitle={fmt(d.subtitle, { name: personName })}
      closeLabel={d.later}
    >
      <form action={formAction} className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-text-muted">{d.body}</p>

        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setValue(String(p.percent))}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="w-36">
            <label
              htmlFor="dual_rate_override"
              className="mb-1.5 block text-[12px] font-medium text-text-muted"
            >
              {d.inputLabel}
            </label>
            <Input
              id="dual_rate_override"
              name="dual_rate_override"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>

        {!state.ok && state.message && (
          <p
            role="alert"
            className="rounded-md border border-error/15 bg-error-bg px-3 py-2 text-sm text-error"
          >
            {state.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {d.later}
          </Button>
          <Button type="submit" disabled={pending}>
            {d.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
