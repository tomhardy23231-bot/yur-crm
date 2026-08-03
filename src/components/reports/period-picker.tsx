'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { kyivToday, monthNamesFrom } from '@/lib/payroll/month';
import {
  isValidDate,
  periodLabel,
  presetRange,
  shiftPeriod,
  type Period,
  type PeriodPreset,
} from '@/lib/reports/period';

// Селектор периода отчёта (2026-08-03) — замена помесячного MonthPicker на
// страницах кассы: месяц / квартал / год / произвольный диапазон.
//
// Период живёт в URL как ?from=&to= (обе границы включительно), поэтому ссылку
// на отчёт можно переслать. Пресет в URL не хранится — он вычисляется из
// границ (detectPreset), иначе третий параметр рассинхронизировался бы с ними
// при ручной правке ссылки.
//
// Вперёд не ограничиваем: в базе есть платежи будущими датами (график
// рассрочки), и упереться в «сегодня» здесь было бы неверно.
export function PeriodPicker({ period }: { period: Period }) {
  const { t } = useI18n();
  const p = t.cash.period;
  const monthNames = monthNamesFrom(t.payroll);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(period.from);
  const [customTo, setCustomTo] = useState(period.to);
  const boxRef = useRef<HTMLDivElement>(null);

  // Поля произвольного диапазона заполняются текущим периодом В МОМЕНТ
  // открытия панели, а не эффектом на смену пропсов: пока панель открыта,
  // введённые пользователем даты не должны затираться.
  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        setCustomFrom(period.from);
        setCustomTo(period.to);
      }
      return !wasOpen;
    });
  };

  // Закрытие панели: клик мимо и Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (next: { from: string; to: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', next.from);
    params.set('to', next.to);
    // Старый помесячный параметр больше не нужен — иначе он спорил бы с from/to.
    params.delete('month');
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyPreset = (preset: Exclude<PeriodPreset, 'custom'>) => {
    // Опора — сегодня, если оно внутри текущего периода: переключение
    // «год → месяц» должно давать ТЕКУЩИЙ месяц, а не январь.
    const today = kyivToday();
    const anchor = today >= period.from && today <= period.to ? today : period.from;
    go(presetRange(preset, anchor));
    setOpen(false);
  };

  const applyCustom = () => {
    if (!isValidDate(customFrom) || !isValidDate(customTo)) return;
    const [from, to] =
      customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    go({ from, to });
    setOpen(false);
  };

  const label = periodLabel(period, monthNames, {
    quarter: p.quarterWord,
    year: p.yearWord,
  });
  const customInvalid = !isValidDate(customFrom) || !isValidDate(customTo);

  return (
    <div
      ref={boxRef}
      className="relative inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      role="group"
      aria-label={p.label}
    >
      <button
        type="button"
        onClick={() => go(shiftPeriod(period, -1))}
        aria-label={p.prev}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />
      </button>

      {/* Подпись периода — она же кнопка раскрытия панели выбора. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex min-w-[150px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5',
          'text-[13px] font-semibold tabular-nums text-text transition-colors',
          'hover:bg-primary-softer hover:text-primary-pressed',
          open && 'bg-primary-softer text-primary-pressed',
        )}
      >
        <CalendarRange size={14} strokeWidth={2} aria-hidden="true" />
        {label}
      </button>

      <button
        type="button"
        onClick={() => go(shiftPeriod(period, 1))}
        aria-label={p.next}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-primary-softer hover:text-primary-pressed"
      >
        <ChevronRight size={16} strokeWidth={2.2} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={p.label}
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[280px] rounded-card border border-border bg-surface p-3 shadow-lg"
        >
          {/* Пресеты — быстрый выбор калибра. */}
          <div className="flex gap-1.5">
            {(
              [
                ['month', p.presetMonth],
                ['quarter', p.presetQuarter],
                ['year', p.presetYear],
              ] as const
            ).map(([preset, text]) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className={cn(
                  'flex-1 rounded-chip border px-2 py-1.5 text-[12.5px] font-semibold transition-colors',
                  period.preset === preset
                    ? 'border-primary-border bg-primary-softer text-primary-pressed'
                    : 'border-border bg-surface text-text-muted hover:border-primary-border hover:text-primary-pressed',
                )}
              >
                {text}
              </button>
            ))}
          </div>

          {/* Произвольный диапазон. */}
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
              {p.customTitle}
            </p>
            <div className="mt-2 flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[11.5px] text-text-muted">{p.from}</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-full rounded-lg border border-border bg-surface px-2 text-[12.5px] tabular-nums text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[11.5px] text-text-muted">{p.to}</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-full rounded-lg border border-border bg-surface px-2 text-[12.5px] tabular-nums text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                />
              </label>
            </div>
            <Button
              size="sm"
              className="mt-2.5 w-full"
              onClick={applyCustom}
              disabled={customInvalid}
            >
              {p.apply}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
