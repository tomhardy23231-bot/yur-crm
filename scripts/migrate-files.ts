// scripts/migrate-files.ts
// Перенос файлов Supabase Storage → целевое хранилище (R2/local) — цикл v4 с5.
//
// Запуск:
//   npm run migrate:files -- --dry-run        # только посчитать, ничего не грузить
//   npm run migrate:files                      # боевой перенос
//   npm run migrate:files -- --limit 50        # первые 50 (проба)
//
// ИСТОЧНИК  — Supabase Storage (bucket case-documents), креды
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (уходят в сессии 6,
//   но скрипт нужен ДО того — это последнее обращение к Supabase).
// СПИСОК    — documents из Neon (adminDb): авторитетный перечень storage_key.
// ЦЕЛЬ      — storage() по STORAGE_PROVIDER: s3 (R2, боевое) | local (репетиция).
//
// ИДЕМПОТЕНТЕН: ведёт манифест перенесённых ключей (backups/), обрыв = докачка
// (перезапуск пропускает уже перенесённое). Повторный upload того же ключа
// безвреден (перезапись тем же контентом), манифест лишь ускоряет пропуск.
// СВЕРКА: печатает число документов в БД, перенесено, пропущено, «нет в
// Supabase» (расхождение) и суммарный объём; выход с кодом 2, если что-то не
// нашлось в источнике (стоп-сигнал перед сессией 7).

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { adminDb } from '@/lib/db/admin';
import { storage } from '@/lib/storage';
import { guessContentType } from '@/lib/storage/util';

const BUCKET = 'case-documents';
const MANIFEST = path.join(
  process.cwd(),
  'backups',
  'file-migration-manifest.json',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limIdx = args.indexOf('--limit');
const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : Infinity;

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY нужны как ИСТОЧНИК переноса',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type Manifest = Record<string, { size: number; at: string }>;

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as Manifest;
  } catch {
    return {};
  }
}

async function saveManifest(m: Manifest): Promise<void> {
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(m, null, 2));
}

async function main(): Promise<void> {
  const supa = supabaseAdmin();
  const target = storage();
  const docs = await adminDb().documents.findMany({
    select: { storage_key: true, file_name: true },
  });
  const manifest = await loadManifest();

  console.log(
    `Перенос файлов: ${docs.length} документов в БД, провайдер-цель=${process.env.STORAGE_PROVIDER ?? 'local'}` +
      (dryRun ? ' [DRY-RUN]' : ''),
  );

  let migrated = 0;
  let skipped = 0;
  let missing = 0;
  let bytes = 0;
  let processed = 0;

  for (const d of docs) {
    if (processed >= limit) break;
    processed++;

    if (manifest[d.storage_key]) {
      skipped++;
      continue;
    }

    const { data, error } = await supa.storage
      .from(BUCKET)
      .download(d.storage_key);
    if (error || !data) {
      console.warn(
        `  MISSING в Supabase: ${d.storage_key} (${error?.message ?? 'нет данных'})`,
      );
      missing++;
      continue;
    }

    const buf = Buffer.from(await data.arrayBuffer());
    bytes += buf.length;

    if (dryRun) {
      migrated++;
      continue;
    }

    const contentType = data.type || guessContentType(d.file_name);
    await target.upload(d.storage_key, buf, { contentType });
    manifest[d.storage_key] = {
      size: buf.length,
      at: new Date().toISOString(),
    };
    migrated++;

    if (migrated % 20 === 0) {
      await saveManifest(manifest);
      console.log(`  … ${migrated} перенесено`);
    }
  }

  if (!dryRun) await saveManifest(manifest);

  console.log('─'.repeat(48));
  console.log(`Документов в БД:            ${docs.length}`);
  console.log(`Перенесено:                ${migrated}`);
  console.log(`Пропущено (в манифесте):   ${skipped}`);
  console.log(`Нет в Supabase (пропуск):  ${missing}`);
  console.log(`Суммарный объём:           ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  if (missing > 0) {
    console.error(
      '\n⚠ Часть файлов не нашлась в Supabase Storage — разобрать до сессии 7.',
    );
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
