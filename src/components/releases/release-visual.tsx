'use client';

import { Landmark, Plus, RefreshCw, Receipt, TriangleAlert } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';

// Мини-мокапы для модалки «Что нового» (2026-07-26). Не картинки-файлы, а
// маленькие копии реального интерфейса из тех же токенов: они не устаревают
// вместе со скриншотами и не тянут вес в бандл. Ключ секции релиза → мокап.
export type ReleaseVisualKey = 'accounts' | 'sync' | 'expenses';

export function ReleaseVisual({ visual }: { visual?: ReleaseVisualKey }) {
  const { t } = useI18n();
  if (!visual) return null;

  const v = t.help.release.visual;

  return (
    <div className="rounded-card border border-border bg-surface-sunken/50 p-3">
      {visual === 'accounts' && (
        <div className="flex flex-wrap items-stretch gap-2.5">
          {/* Карточка счёта — как в разделе «Рахунки» */}
          <div className="min-w-[190px] flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <div className="h-1 w-full bg-primary" aria-hidden="true" />
            <div className="flex flex-col gap-1.5 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
                <Landmark size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="text-[12px] font-medium text-text-muted">{v.accountName}</p>
              <p className="font-mono text-[17px] font-bold leading-none tabular-nums text-text">
                48 200 <span className="text-[10px] text-text-subtle">₴</span>
              </p>
              <p className="text-[10.5px] text-text-subtle">{v.accountOpening}</p>
            </div>
          </div>
          {/* Кнопка добавления */}
          <div className="flex min-w-[150px] flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 p-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-hover px-3 py-1.5 text-[12px] font-semibold text-white shadow-brand">
              <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
              {v.addAccount}
            </span>
          </div>
        </div>
      )}

      {visual === 'sync' && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2">
          <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-text">
            <span className="font-medium">{v.syncNotice}</span>{' '}
            <span className="text-text-muted">{v.syncHint}</span>
          </p>
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-white">
            <RefreshCw size={12} strokeWidth={1.75} aria-hidden="true" />
            {v.syncButton}
          </span>
        </div>
      )}

      {visual === 'expenses' && (
        <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-surface">
          {[
            { cat: v.expRent, note: v.expRentNote, sum: '10 000' },
            { cat: v.expTaxes, note: v.expTaxesNote, sum: '41 696' },
            { cat: v.expOffice, note: v.expOfficeNote, sum: '294' },
          ].map((row) => (
            <li key={row.cat} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2">
              <span className="font-mono text-[11px] tabular-nums text-text-subtle">01.08</span>
              <span className="inline-flex items-center gap-1 rounded-chip bg-warning-bg px-2 py-0.5 text-[10.5px] font-semibold text-warning-text">
                <Receipt size={10} strokeWidth={2.25} aria-hidden="true" />
                {row.cat}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-text">{row.note}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums text-error">
                −{row.sum} ₴
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
