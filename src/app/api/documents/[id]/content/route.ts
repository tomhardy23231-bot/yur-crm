import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyHs256 } from '@/lib/onlyoffice/jwt';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/documents/<id>/content?token=<jwt>
// Эндпоинт, с которого OnlyOffice Document Server СКАЧИВАЕТ файл. Сессии
// пользователя тут нет — авторизация по краткоживущему JWT (content-токен),
// который мы выдали в oo-config только пользователю, прошедшему RLS. Поэтому
// читаем storage service-ролью (обход RLS) — это безопасно: токен и есть
// авторизация, привязан к конкретному doc_id и истекает за 10 минут.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  const token = new URL(req.url).searchParams.get('token');

  if (!secret || !token || !id || !UUID_RE.test(id)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const payload = verifyHs256<{ doc_id?: string }>(token, secret);
  if (!payload || payload.doc_id !== id) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('documents')
    .select('storage_key, file_name')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { data: blob, error } = await admin.storage
    .from('case-documents')
    .download(row.storage_key);
  if (error || !blob) {
    console.error('content route download failed:', error?.message);
    return new NextResponse('Failed to read file', { status: 500 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
