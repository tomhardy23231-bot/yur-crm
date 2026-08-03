'use client';

import Link from 'next/link';
import { FileSpreadsheet, Printer } from 'lucide-react';

import { useI18n } from '@/lib/i18n/provider';
import type { Period } from '@/lib/reports/period';

// Кнопки выгрузки отчёта: Excel файлом и печатная версия (из неё браузер
// делает PDF). Вынесены отдельно, потому что нужны и новым вкладкам отчётов,
// и старым («Витрати», «За справами») — у тех свой богатый UI, менять его на
// таблицу незачем, а выгрузка нужна такая же.
//
// Excel — обычная <a>, а не <Link>: это скачивание файла, не навигация.
export function ReportExportButtons({
  kind,
  period,
  dim,
}: {
  kind: string;
  period: Period;
  /** Разрез — только для отчёта по доходам. */
  dim?: string;
}) {
  const { t } = useI18n();
  const r = t.cash.reports;

  const query = new URLSearchParams({ from: period.from, to: period.to });
  if (dim) query.set('dim', dim);

  const cls =
    'inline-flex h-8 items-center gap-1.5 rounded-chip border border-border bg-surface px-3 text-[12.5px] font-medium text-text-muted transition-colors hover:border-primary-border hover:bg-primary-softer hover:text-primary-pressed';

  return (
    <div className="flex shrink-0 items-center gap-2">
      <a
        href={`/reports/cash/export?report=${kind}&${query.toString()}`}
        title={r.exportHint}
        className={cls}
      >
        <FileSpreadsheet size={13} strokeWidth={1.75} aria-hidden="true" />
        {r.exportXlsx}
      </a>
      <Link
        href={`/reports/cash/print/${kind}?${query.toString()}`}
        title={r.printHint}
        className={cls}
      >
        <Printer size={13} strokeWidth={1.75} aria-hidden="true" />
        {r.exportPdf}
      </Link>
    </div>
  );
}
