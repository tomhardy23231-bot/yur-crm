// Раннер SQL-миграций (цикл v4): применяет db/migrations/*.sql по алфавиту,
// одна транзакция на файл, журнал применённого — public._migrations.
//
// Запуск: npm run db:migrate
// Подключение: DATABASE_URL_ADMIN_DIRECT — DIRECT-строка владельца БД
// (НЕ pooled: DDL и multi-statement SQL не для pgbouncer transaction mode).
//
// Конвенция файлов: NNNN_name.sql (0000_shim.sql, 0001_baseline.sql, дальше
// обычные инкрементальные миграции поверх baseline). Файл применяется один
// раз; правка уже применённого файла НЕ перезапускает его — пиши новый.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
// произвольная константа проекта — сериализует конкурентные прогоны
const ADVISORY_LOCK_KEY = 727274;

async function main() {
  const url = process.env.DATABASE_URL_ADMIN_DIRECT;
  if (!url) {
    throw new Error('DATABASE_URL_ADMIN_DIRECT не задан (см. .env.example)');
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      create table if not exists public._migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )`);
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    const applied = new Set<string>(
      (await client.query('select name from public._migrations')).rows.map(
        (r: { name: string }) => r.name,
      ),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`applying ${file} ... `);
      const started = Date.now();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into public._migrations (name) values ($1)',
          [file],
        );
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        console.error('FAILED');
        throw err;
      }
      // SET-ы из файла (search_path='' и т.п.) не должны протекать в следующий
      await client.query('reset all');
      console.log(`ok (${Date.now() - started} ms)`);
      ran += 1;
    }
    console.log(
      ran > 0 ? `applied ${ran} migration(s)` : 'nothing to apply — up to date',
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
