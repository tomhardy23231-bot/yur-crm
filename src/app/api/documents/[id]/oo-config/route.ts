import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import { getCase } from '@/lib/cases/queries';
import { getDocument } from '@/lib/documents/queries';
import { getLocale } from '@/lib/i18n/server';
import { buildEditorConfig, onlyOfficeConfigured } from '@/lib/onlyoffice/config';
import { UUID_RE } from '@/lib/validation';

// GET /api/documents/<id>/oo-config
// Отдаёт подписанный конфиг редактора OnlyOffice. Доступ проверяется RLS:
//  - getDocument(id) виден → пользователь имеет SELECT на дело документа;
//  - режим edit/view вычисляется на СЕРВЕРЕ (как canEdit на карточке), клиенту
//    не доверяем. Если DS не настроен — { configured: false } (UI покажет
//    дружелюбное «редактор недоступен», без падения).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!onlyOfficeConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const doc = await getDocument(id);
  if (!doc) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Право на запись = RLS UPDATE дела (как canEdit на карточке).
  const c = await getCase(doc.case_id);
  const canWrite = Boolean(
    c &&
      (user.caps.view_all_cases ||
        c.responsible_id === user.profile.id ||
        c.lawyer_id === user.profile.id),
  );

  const lang = await getLocale();

  const { config, browserUrl } = buildEditorConfig({
    doc: {
      id: doc.id,
      file_name: doc.file_name,
      uploaded_at: doc.uploaded_at,
      updated_at: doc.updated_at ?? null,
    },
    canWrite,
    user: { id: user.profile.id, name: user.profile.full_name },
    lang,
  });

  return NextResponse.json({ configured: true, config, browserUrl });
}
