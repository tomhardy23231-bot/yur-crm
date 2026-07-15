import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { StorageProvider } from './types';
import { contentDisposition } from './util';

// S3-совместимый провайдер (цикл v4, сессия 5) — боевое хранилище.
//
// Один код на Cloudflare R2 (сейчас) и MinIO/любой S3 (корп-сервер потом):
// оба говорят на протоколе S3, переезд = смена env, без правки вызовов
// (CLAUDE.md §1.4). Настройка через env:
//   S3_ENDPOINT          — R2: https://<account_id>.r2.cloudflarestorage.com
//   S3_REGION            — R2: auto; MinIO/AWS — свой регион
//   S3_ACCESS_KEY_ID     — ключ доступа
//   S3_SECRET_ACCESS_KEY — секрет
//   S3_BUCKET            — имя бакета (case-documents)
//   S3_FORCE_PATH_STYLE  — 'true' для MinIO (path-style URL); R2 — не задавать
//
// Аккаунт R2 заводится НА ВЛАДЕЛЬЦА (bus factor, план §5 сессия 5); до этого
// dev работает на локальном провайдере (STORAGE_PROVIDER=local).

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} не задан — требуется для STORAGE_PROVIDER=s3 (см. .env.example)`,
    );
  }
  return v;
}

let client: S3Client | null = null;
let bucket: string | null = null;

function getClient(): { s3: S3Client; bucket: string } {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: env('S3_ENDPOINT'),
      credentials: {
        accessKeyId: env('S3_ACCESS_KEY_ID'),
        secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
    bucket = env('S3_BUCKET');
  }
  return { s3: client, bucket: bucket! };
}

export function makeS3Provider(): StorageProvider {
  return {
    async upload(key, body, opts) {
      const { s3, bucket } = getClient();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
        }),
      );
    },

    async download(key) {
      const { s3, bucket } = getClient();
      const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!res.Body) throw new Error(`storage(s3): пустое тело объекта ${key}`);
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    },

    async signedUrl(key, opts) {
      const { s3, bucket } = getClient();
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // download → attachment с оригинальным именем; иначе inline-просмотр.
        ResponseContentDisposition: opts?.download
          ? contentDisposition('attachment', opts.download)
          : undefined,
      });
      return getSignedUrl(s3, cmd, { expiresIn: opts?.expiresIn ?? 600 });
    },

    async remove(key) {
      const { s3, bucket } = getClient();
      // DeleteObject идемпотентен: удаление отсутствующего ключа — не ошибка.
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
