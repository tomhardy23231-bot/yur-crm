import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/require-role';
import {
  createSignedDownloadUrl,
  createSignedPreviewUrl,
  getDocument,
} from '@/lib/documents/queries';
import { isNativePreview, previewKind } from '@/lib/documents/preview';
import { UUID_RE } from '@/lib/validation';

// GET /api/documents/<doc_id>/preview
// Как download-роут, но даёт INLINE signed URL (без флага download), чтобы
// браузер открыл файл в iframe/img. Безопасность: inline отдаём только для
// заведомо безопасных к показу типов (картинки/pdf/текст); всё прочее —
// фолбэк на скачивание (Content-Disposition: attachment), чтобы случайный
// html/svg не исполнился inline. Office-доки (docx/xlsx) показывает OnlyOffice,
// сюда не приходят.
export async function GET(
  req: Request,
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
    const inline = isNativePreview(previewKind(doc.file_name));
    const url = inline
      ? await createSignedPreviewUrl(doc.storage_key)
      : await createSignedDownloadUrl(doc.storage_key, doc.file_name);
    // signedUrl локального провайдера относителен — резолвим по origin запроса;
    // presigned URL S3/R2 абсолютен и проходит насквозь.
    return NextResponse.redirect(new URL(url, req.url), { status: 307 });
  } catch (err) {
    console.error('preview route failed:', err);
    return new NextResponse('Failed to create preview link', { status: 500 });
  }
}
