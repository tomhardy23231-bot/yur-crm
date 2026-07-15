import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { StorageProvider, SignedUrlOptions } from './types';

// Локальный файловый провайдер (цикл v4, сессия 5) — для dev и тестов БЕЗ
// облака. Пишет объекты в папку на диске (STORAGE_LOCAL_DIR, по умолчанию
// .storage/ в корне проекта, в .gitignore). На проде НЕ используется — там
// STORAGE_PROVIDER=s3 (R2), позже MinIO/диск на корп-сервере.
//
// signedUrl: у диска нет облачного URL для редиректа браузера, поэтому ссылка
// ведёт на наш стрим-роут /api/storage/local с HMAC-подписью (секрет
// AUTH_SECRET) — так поведение совпадает с боевым S3 (редирект → отдача файла
// без пользовательской сессии; подпись и есть авторизация, TTL истекает).

function getRoot(): string {
  return process.env.STORAGE_LOCAL_DIR
    ? path.resolve(process.env.STORAGE_LOCAL_DIR)
    : path.join(process.cwd(), '.storage');
}

// storage_key (`cases/<uuid>/<uuid>--slug`) → абсолютный путь под root, с
// защитой от path-traversal (ключ извне мог бы содержать `..`).
function keyToPath(key: string): string {
  const root = getRoot();
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('storage(local): недопустимый ключ (path traversal)');
  }
  return resolved;
}

function hmacSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET требуется для подписи ссылок локального storage-провайдера',
    );
  }
  return secret;
}

// Подпись параметров ссылки. `disp` — 'a' (attachment) | 'i' (inline).
function sign(key: string, exp: number, disp: string, name: string): string {
  return createHmac('sha256', hmacSecret())
    .update(`${key}\n${exp}\n${disp}\n${name}`)
    .digest('base64url');
}

export type LocalSignedParams = {
  key: string;
  exp: string;
  disp: string;
  name: string;
  sig: string;
};

// Проверка подписи + срока (стрим-роут зовёт до отдачи файла). timing-safe,
// чтобы подпись нельзя было подобрать по времени сравнения.
export function verifyLocalSignedParams(p: LocalSignedParams): boolean {
  const exp = Number(p.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = sign(p.key, exp, p.disp, p.name);
  const a = Buffer.from(expected);
  const b = Buffer.from(p.sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return fs.readFile(keyToPath(key));
}

export const localProvider: StorageProvider = {
  async upload(key, body) {
    const dest = keyToPath(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
  },

  async download(key) {
    return readLocalFile(key);
  },

  async signedUrl(key, opts?: SignedUrlOptions) {
    const ttl = opts?.expiresIn ?? 600;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const disp = opts?.download ? 'a' : 'i';
    const name = opts?.download ?? '';
    const q = new URLSearchParams({
      key,
      exp: String(exp),
      disp,
      name,
      sig: sign(key, exp, disp, name),
    });
    return `/api/storage/local?${q.toString()}`;
  },

  async remove(key) {
    try {
      await fs.unlink(keyToPath(key));
    } catch (err) {
      // Идемпотентность: отсутствующий файл — не ошибка (как remove в S3/R2).
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  },
};
