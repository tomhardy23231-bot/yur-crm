import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import { getActPrintData } from '@/lib/acts/queries';
import { buildActWorkbook } from '@/lib/acts/xlsx';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET /cases/:id/acts/:actId/xlsx — печатная форма «Рахунок-Акт» (XLSX).
// Видимость — через RLS-сессию (getActPrintData вернёт null для невидимого акта).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; actId: string }> },
) {
  await requireUser();
  const { id, actId } = await params;

  const data = await getActPrintData(actId);
  // RLS уже режет невидимые акты; дополнительно сверяем, что акт принадлежит делу
  // из URL (консистентность маршрута).
  if (!data || data.act.case_id !== id) {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = await buildActWorkbook(data);
  const filename = `rahunok-akt-${data.act.number}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
