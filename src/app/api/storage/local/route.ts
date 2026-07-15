import { NextResponse } from 'next/server';

import {
  readLocalFile,
  verifyLocalSignedParams,
} from '@/lib/storage/local';
import { contentDisposition, guessContentType } from '@/lib/storage/util';

// GET /api/storage/local?key=&exp=&disp=&name=&sig=
// Стрим-роут ЛОКАЛЬНОГО storage-провайдера (dev). На проде (STORAGE_PROVIDER=s3)
// не задействован — там signedUrl ведёт напрямую в R2. Авторизация — HMAC-подпись
// в query (секрет AUTH_SECRET), сессия не нужна: зеркало presigned URL S3 (роут
// исключён из auth-прокси). Подпись привязана к ключу и истекает (exp).
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? '';
  const exp = url.searchParams.get('exp') ?? '';
  const disp = url.searchParams.get('disp') ?? 'i';
  const name = url.searchParams.get('name') ?? '';
  const sig = url.searchParams.get('sig') ?? '';

  if (!key || !sig || !verifyLocalSignedParams({ key, exp, disp, name, sig })) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await readLocalFile(key);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const attachment = disp === 'a';
  const filename = name || key.split('/').pop() || 'file';

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': guessContentType(filename),
      'Content-Disposition': attachment
        ? contentDisposition('attachment', filename)
        : 'inline',
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
