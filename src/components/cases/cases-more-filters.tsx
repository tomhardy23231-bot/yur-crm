'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';

// Поповер со второстепенными фильтрами списка дел (редизайн Волна 2): убирает
// людей/подразделение из основного ряда, чтобы он не был перегружен 7 дропдаунами.
// Бейдж показывает число активных скрытых фильтров. Клик по активному фильтру
// делает soft-навигацию (router.replace) — поповер остаётся открытым, можно
// выставить несколько. Клики внутри Radix-портала открытого Select поповер НЕ
// закрывают.
export function CasesMoreFilters({
  label,
  activeCount,
  children,
}: {
  label: string;
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const tgt = e.target as Element | null;
      // Раскрытый Select рисуется в портале вне нашего поддерева — его клики
      // не должны закрывать поповер.
      if (
        tgt?.closest?.(
          '[data-radix-popper-content-wrapper],[data-radix-select-content]',
        )
      ) {
        return;
      }
      if (ref.current && !ref.current.contains(tgt)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium transition-colors',
          activeCount > 0
            ? 'border-primary-border bg-primary-subtle text-primary'
            : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
        )}
      >
        <SlidersHorizontal size={15} strokeWidth={1.75} />
        {label}
        {activeCount > 0 && (
          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-fg">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 flex w-[min(260px,85vw)] flex-col items-start gap-2.5 rounded-card border border-border bg-surface p-3 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
