import { NextResponse } from 'next/server';

import { adminDb } from '@/lib/db/admin';
import { storage } from '@/lib/storage';
import { verifyHs256 } from '@/lib/onlyoffice/jwt';
import { UUID_RE } from '@/lib/validation';

// GET /api/documents/<id>/content?token=<jwt>
// Эндпоинт, с которого OnlyOffice Document Server СКАЧИВАЕТ файл. Сессии
// пользователя тут нет — авторизация по краткоживущему JWT (content-токен),
// который мы выдали в oo-config только пользователю, прошедшему RLS. Поэтому
// читаем хранилище admin-пулом (обход RLS) — это безопасно: токен и есть
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

  const row = await adminDb().documents.findUnique({
    where: { id },
    select: { storage_key: true },
  });
  if (!row) {
    return new NextResponse('Not found', { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await storage().download(row.storage_key);
  } catch (err) {
    console.error('content route download failed:', err);
    return new NextResponse('Failed to read file', { status: 500 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
