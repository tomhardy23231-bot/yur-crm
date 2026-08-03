import { notFound } from 'next/navigation';

import { requireAnyCap } from '@/lib/auth/require-role';
import {
  buildCashReportDoc,
  isCashReportKind,
  isIncomeDim,
} from '@/lib/reports/cash/documents';
import { resolvePeriod } from '@/lib/reports/period';
import { PrintToolbar } from '@/components/reports/print-toolbar';
import { ReportPrintSheet } from '@/components/reports/report-print-sheet';

// Печатная версия отчёта кассы (2026-08-03):
// /reports/cash/print/turnover?from=&to= — route-group (print), без сайдбара,
// белая страница-документ. «Скачать PDF» = window.print() в тулбаре; @media
// print в globals.css приводит лист к A4.
//
// Сегмент /print/ в пути НЕ косметический: без него динамический [kind]
// перехватывал бы и /reports/cash/export (роут выгрузки XLSX) — два маршрута
// на один путь Next не разрешает.
//
// Тот же ReportDoc, что уходит в Excel и рисуется на экране, — цифры
// совпадают по построению.
export default async function CashReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    month?: string;
    dim?: string;
  }>;
}) {
  await requireAnyCap(['view_cash', 'can_manage_cash']);

  const { kind } = await params;
  if (!isCashReportKind(kind)) notFound();

  const sp = await searchParams;
  const period = resolvePeriod({ from: sp.from, to: sp.to, month: sp.month });
  const dim = isIncomeDim(sp.dim) ? sp.dim : 'case';

  const doc = await buildCashReportDoc(kind, period, dim);

  // Возврат — на ту же кассу и тот же период, откуда пришли.
  const back = `/reports/cash?from=${period.from}&to=${period.to}`;

  return (
    <>
      <PrintToolbar backHref={back} />
      <ReportPrintSheet doc={doc} />
    </>
  );
}
