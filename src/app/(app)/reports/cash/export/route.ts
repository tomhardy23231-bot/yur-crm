import { NextResponse } from 'next/server';

import { requireAnyCap } from '@/lib/auth/require-role';
import {
  buildCashReportDoc,
  isCashReportKind,
  isIncomeDim,
} from '@/lib/reports/cash/documents';
import { buildReportWorkbook } from '@/lib/reports/export/xlsx';
import { resolvePeriod } from '@/lib/reports/period';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET /reports/cash/export?report=turnover|flow|income&from=&to=&dim=
// Выгрузка отчёта кассы в XLSX (2026-08-03).
//
// ДОСТУП — двойной, как и у страницы отчёта: requireAnyCap отсекает чужих на
// входе, а сами данные тянутся через userDb → RLS и гейты внутри SQL-функций.
// Выгрузка не должна быть дырой мимо прав: она отдаёт ровно то, что зритель
// видит на экране.
export async function GET(req: Request) {
  await requireAnyCap(['view_cash', 'can_manage_cash']);

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('report');
  if (!isCashReportKind(kindParam)) {
    return new NextResponse('Unknown report', { status: 400 });
  }
  const dimParam = url.searchParams.get('dim');
  const dim = isIncomeDim(dimParam) ? dimParam : 'case';

  // Тот же разбор периода, что и на странице: мусор в URL не роняет выгрузку,
  // а откатывается к текущему месяцу.
  const period = resolvePeriod({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    month: url.searchParams.get('month'),
  });

  const doc = await buildCashReportDoc(kindParam, period, dim);
  const buffer = await buildReportWorkbook(doc);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${doc.fileBase}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
