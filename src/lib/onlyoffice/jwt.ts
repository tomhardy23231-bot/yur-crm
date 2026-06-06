import 'server-only';

import crypto from 'node:crypto';

// Минимальный HS256-JWT на node:crypto — без внешних зависимостей. Используется
// для подписи конфига редактора OnlyOffice и краткоживущего content-токена, а
// также для проверки callback от Document Server. Один общий секрет (ENV).

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

// Подписать произвольный объект-payload. Никаких авто-claims (iat/exp) не
// добавляем: OnlyOffice сверяет payload токена с телом запроса, лишние поля
// могут мешать. Срок (exp) при необходимости кладём в payload явно сами.
export function signHs256(payload: object, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

// Проверить подпись и (если есть) exp. Возвращает payload или null.
export function verifyHs256<T = Record<string, unknown>>(
  token: string,
  secret: string,
): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp === 'number' && Math.floor(Date.now() / 1000) > exp) {
    return null;
  }
  return payload as T;
}
