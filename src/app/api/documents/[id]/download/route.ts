import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import {
  createSignedDownloadUrl,
  getDocument,
} from '@/lib/documents/queries';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/documents/<doc_id>/download
// Авторизованный SELECT по RLS → если виден, делаем signed URL (TTL 10 мин)
// и редиректим браузер на storage. Если не виден (RLS вернул null) → 404.
//
// CSO #3: единый 404 на любой невалидный/несуществующий id — иначе
// не-UUID давал бы Postgres 22P02 → 500, выдавая разницу 500/404 как
// инфо-канал «id похож на UUID, но недоступен» vs «id мусор».
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const doc = await getDocument(id);
  if (!doc) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const url = await createSignedDownloadUrl(doc.storage_key, doc.file_name);
    return NextResponse.redirect(url, { status: 307 });
  } catch (err) {
    console.error('download route failed:', err);
    return new NextResponse('Failed to create download link', { status: 500 });
  }
}
