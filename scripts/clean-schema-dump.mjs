#!/usr/bin/env node
// Очистка pg_dump-слепка схемы от Supabase-специфики (цикл v4, ревью A2).
// Вход — сырой `pg_dump --schema-only --schema=public --schema=private --no-owner`,
// выход — SQL, пригодный для прогона на чистом Postgres (Neon) ПОСЛЕ 0000_shim.sql.
//
// Используется:
//  - сессия 1: генерация db/migrations/0001_baseline.sql с локальной базы;
//  - сессии 6–7: та же чистка дампа ПРОДА для diff-сверки слепок↔прод.
//
// Правила удаления (всё однострочное в формате pg_dump 17):
//  1. `\restrict` / `\unrestrict` — psql-метакоманды PG 17.6+, не SQL;
//  2. `CREATE SCHEMA public;` — схема public уже существует на любой базе;
//  3. GRANT/REVOKE с получателями anon / service_role / postgres — роли
//     Supabase-платформы; в новой модели гранты нужны только authenticated
//     (app_user наследует), admin-путь = owner БД и в грантах не нуждается;
//  4. ALTER DEFAULT PRIVILEGES — платформенные дефолты Supabase; наши
//     миграции всегда грантят явно (blanket-GRANT запрещён ревью V3-3).

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/clean-schema-dump.mjs <raw.sql> <out.sql>');
  process.exit(1);
}

const PLATFORM_GRANT_RE =
  /^(GRANT|REVOKE)\b.*\b(TO|FROM)\s+(anon|service_role|postgres)\s*(,.*)?;$/;

const rules = [
  {
    name: 'psql \\restrict guard',
    test: (l) => l.startsWith('\\restrict') || l.startsWith('\\unrestrict'),
  },
  { name: 'CREATE SCHEMA public', test: (l) => l === 'CREATE SCHEMA public;' },
  { name: 'grant to platform role', test: (l) => PLATFORM_GRANT_RE.test(l) },
  {
    name: 'ALTER DEFAULT PRIVILEGES',
    test: (l) => l.startsWith('ALTER DEFAULT PRIVILEGES'),
  },
];

const lines = readFileSync(inPath, 'utf8').split('\n');
const dropped = new Map();
const kept = lines.filter((raw) => {
  const line = raw.trim();
  const rule = rules.find((r) => r.test(line));
  if (rule) {
    dropped.set(rule.name, (dropped.get(rule.name) ?? 0) + 1);
    return false;
  }
  return true;
});

writeFileSync(outPath, kept.join('\n'));
for (const [name, n] of dropped) console.log(`removed ${n} × ${name}`);
console.log(`written ${outPath}: ${kept.length} lines (was ${lines.length})`);

// Страховка: в очищенном файле не должно остаться упоминаний платформенных
// ролей и Supabase-схем (кроме auth.uid()/auth.users, которые даёт шим).
const leftover = kept.filter(
  (l) =>
    /\b(TO|FROM)\s+(anon|service_role|postgres)\b/.test(l) ||
    /\b(storage|realtime|vault|graphql|supabase_functions)\./.test(l),
);
if (leftover.length) {
  console.error('LEFTOVER platform references:');
  for (const l of leftover) console.error('  ' + l.trim());
  process.exit(1);
}
console.log('leftover check: clean');
