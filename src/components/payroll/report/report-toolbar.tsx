'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/payroll/month-picker';
import { useI18n } from '@/lib/i18n/provider';

// Панель действий отчёта — полноширинная, прилипает сверху. Скрывается при печати.
// «Скачать PDF» = системный диалог печати браузера → «Сохранить как PDF».
export function ReportToolbar({
  backHref,
  month,
}: {
  backHref: string;
  month: string;
}) {
  const { t } = useI18n();
  return (
    <div className="no-print sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft size={15} strokeWidth={1.75} />
            {t.payrollPrint.toolbar.back}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} />
          <Button size="sm" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={1.75} />
            {t.payrollPrint.toolbar.downloadPdf}
          </Button>
        </div>
      </div>
    </div>
  );
}
