import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyHs256 } from '@/lib/onlyoffice/jwt';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// OnlyOffice callback статусы:
//  1 — редактируется; 2 — готов к сохранению (все вышли); 3 — ошибка сохранения;
//  4 — закрыт без изменений; 6 — форс-сейв во время редактирования; 7 — ошибка форс-сейва.
type OoCallback = {
  status?: number;
  url?: string;
  key?: string;
};

// Куда app достучится до DS, чтобы скачать сохранённый файл (DS отдаёт ссылку
// на свой кэш — перепишем её origin на наш internal URL DS).
function rewriteToInternal(dsUrl: string): string {
  const internal =
    process.env.ONLYOFFICE_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_ONLYOFFICE_URL ??
    '';
  if (!internal) return dsUrl;
  try {
    const u = new URL(dsUrl);
    const t = new URL(internal);
    u.protocol = t.protocol;
    u.host = t.host;
    return u.toString();
  } catch {
    return dsUrl;
  }
}

// POST /api/documents/<id>/oo-callback
// Document Server зовёт этот URL при сохранении. Тело подписано JWT (в body.token
// или в заголовке Authorization: Bearer). На статус 2/6 — скачиваем изменённый
// файл с DS и перезаписываем объект в Storage (service-роль), бампим updated_at.
// Ответ строго { error: 0 } при успехе — иначе DS считает сохранение неудачным.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = process.env.ONLYOFFICE_JWT_SECRET;

  // БЕЗОПАСНОСТЬ: этот роут исключён из auth-прокси (DS зовёт без сессии), а
  // авторизация — ТОЛЬКО по JWT. Если секрет не задан (OnlyOffice не настроен,
  // напр. на проде без сервера) — НЕ принимаем callback вовсе, иначе любой смог
  // бы POST-ом перезаписать документ произвольным файлом. Подпись обязательна.
  if (!secret) {
    return NextResponse.json({ error: 1 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 1 });
  }

  // Проверка подписи. Полезная нагрузка — в токене (body.token или заголовок).
  const headerTok = (req.headers.get('authorization') ?? '').replace(
    /^Bearer\s+/i,
    '',
  );
  const tok = (typeof raw.token === 'string' ? raw.token : '') || headerTok;
  const data = tok ? verifyHs256<OoCallback>(tok, secret) : null;
  if (!data) {
    return NextResponse.json({ error: 1 });
  }

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 1 });
  }

  const status = data.status ?? 0;

  // Сохраняем только на 2 (готов к сохранению) и 6 (форс-сейв).
  if (status === 2 || status === 6) {
    if (!data.url) return NextResponse.json({ error: 1 });

    try {
      const res = await fetch(rewriteToInternal(data.url));
      if (!res.ok) {
        console.error('oo-callback: fetch edited file failed', res.status);
        return NextResponse.json({ error: 1 });
      }
      const buf = Buffer.from(await res.arrayBuffer());

      const admin = createSupabaseAdminClient();
      const { data: row } = await admin
        .from('documents')
        .select('storage_key')
        .eq('id', id)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: 1 });

      const { error: upErr } = await admin.storage
        .from('case-documents')
        .upload(row.storage_key, buf, { upsert: true });
      if (upErr) {
        console.error('oo-callback: storage upload failed', upErr.message);
        return NextResponse.json({ error: 1 });
      }

      await admin
        .from('documents')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (e) {
      console.error('oo-callback failed:', e);
      return NextResponse.json({ error: 1 });
    }
  }

  return NextResponse.json({ error: 0 });
}
