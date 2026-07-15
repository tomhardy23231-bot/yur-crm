import type { StorageProvider } from './types';
import { localProvider } from './local';
import { makeS3Provider } from './s3';

// Серверный модуль. Guard вместо `import 'server-only'` — как lib/db (та же
// конвенция): server-only-пакет грузится CJS-путём в tsx-скриптах (миграция
// файлов тянет @aws-sdk) и роняет их; typeof-window одинаково защищает от
// попадания в клиентский бандл, но совместим со скриптами.
if (typeof window !== 'undefined') {
  throw new Error('lib/storage — только для сервера, в клиентский бандл не тащить');
}

// Файлохранилище (цикл v4, сессия 5) — единая точка доступа к файлам по делам.
//
// storage() отдаёт провайдера по STORAGE_PROVIDER:
//   local (по умолчанию) — файловая система, для dev/тестов (см. ./local);
//   s3                    — R2/MinIO/любой S3, боевое (см. ./s3).
// Вызывающий код (documents/acts actions+queries, OnlyOffice роуты) провайдера
// не различает — переезд R2 → корп-сервер меняет только env.

let cached: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (!cached) {
    const kind = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();
    cached = kind === 's3' ? makeS3Provider() : localProvider;
  }
  return cached;
}

export type { StorageProvider, SignedUrlOptions } from './types';
