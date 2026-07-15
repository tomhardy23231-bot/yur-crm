// scripts/migrate-data.ts
// Перенос ДАННЫХ прод-Supabase → Neon (цикл v4, задача T7, сессия 7).
// Самодостаточный кросс-БД перенос на чистом pg (без pg_dump в PATH —
// кросс-платформенно, один `npm run migrate:data`). Объёмы юр-CRM малы.
//
// Порядок боевого сценария (план §5 сессия 7, п.2) — ВСЁ В ОДНОЙ ТРАНЗАКЦИИ
// цели (обрыв → rollback возвращает триггеры и baseline атомарно, ретрай чист):
//   1) auth.users ПЕРВЫМ (родитель public.users по FK id→auth.users(id); FK —
//      не USER-триггер, DISABLE TRIGGER его не глушит, поэтому парент раньше).
//      Только id/email/encrypted_password; NULL-хеш = СТОП (иначе сотрудник не
//      войдёт, а сверка этого не увидит — ревью C4). bcrypt-хеши совместимы.
//   2) TRUNCATE baseline-таблиц (departments/payroll_rates/org_requisites):
//      их id сгенерены миграцией 0002 заново и НЕ совпадают с прод-id.
//   3) DISABLE TRIGGER USER на всех public+private таблицах цели —
//      session_replication_role=replica на Neon НЕДОСТУПЕН (owner ≠ superuser,
//      ревью V3-1); глушим пользовательские триггеры (recalc/validate) вручную.
//   4) COPY public в топологическом FK-порядке + private, ПЕРЕСЕЧЕНИЕМ колонок
//      source∩target (target-only колонки типа pwd_version в source нет — ревью
//      C2; source-only колонки логируются как потеря).
//   5) ENABLE TRIGGER USER; setval sequences из МАКСИМУМА цели (не last_value
//      источника — ревью INFORMATIONAL); COMMIT; ANALYZE.
//
// Запуск (боевой — в окно сессии 7, ПОСЛЕ прогона миграций на целевой ветке):
//   SOURCE_DATABASE_URL=postgres://…supabase npm run migrate:data
//   (цель — DATABASE_URL_ADMIN_DIRECT из .env.local; на репетиции цель = Neon dev)
//   npm run migrate:data -- --dry-run   # только посчитать строки, ничего не писать
//
// ⚠ БОЕГОТОВНОСТЬ подтверждается ГЕНЕРАЛЬНОЙ РЕПЕТИЦИЕЙ (свежий прод-дамп →
//   Neon dev → verify-migration). До неё скрипт — заготовка (нет source-БД).

import { Client } from 'pg';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// baseline-данные из миграции 0002 — их id разойдутся с прод-id, чистим ДО COPY.
const BASELINE_TABLES = ['org_requisites', 'payroll_rates', 'departments'];
// наш журнал миграций — целевая БД уже мигрирована, из source НЕ переносим.
const SKIP_TABLES = new Set(['_migrations']);

type ColRow = { table: string; column: string };

async function tableColumns(db: Client, schema: string): Promise<Map<string, string[]>> {
  const { rows } = await db.query<ColRow>(
    `select table_name as table, column_name as column
       from information_schema.columns
      where table_schema = $1
      order by table_name, ordinal_position`,
    [schema],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!map.has(r.table)) map.set(r.table, []);
    map.get(r.table)!.push(r.column);
  }
  return map;
}

async function baseTables(db: Client, schema: string): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE'`,
    [schema],
  );
  return rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));
}

// Таблицы с GENERATED …AS IDENTITY колонкой — только им нужен OVERRIDING
// SYSTEM VALUE при вставке явных id. Для остальных OVERRIDING — ошибка.
async function identityTables(db: Client, schema: string): Promise<Set<string>> {
  const { rows } = await db.query<{ table_name: string }>(
    `select distinct table_name from information_schema.columns
      where table_schema = $1 and is_identity = 'YES'`,
    [schema],
  );
  return new Set(rows.map((r) => r.table_name));
}

// jsonb-колонки: node-pg сериализует JS-массив как postgres array literal '{…}',
// а не JSON — для jsonb это порча. Такие значения кладём через JSON.stringify
// (текст → jsonb каст на вставке), и массивы, и объекты (ревью INFORMATIONAL).
async function jsonbColumns(db: Client, schema: string): Promise<Set<string>> {
  const { rows } = await db.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
      where table_schema = $1 and data_type = 'jsonb'`,
    [schema],
  );
  return new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
}

// Топологический порядок public-таблиц по FK внутри схемы (Kahn).
async function fkOrder(db: Client, tables: string[]): Promise<string[]> {
  const { rows } = await db.query<{ child: string; parent: string }>(
    `select rel.relname as child, ref.relname as parent
       from pg_constraint c
       join pg_class rel on rel.oid = c.conrelid
       join pg_class ref on ref.oid = c.confrelid
       join pg_namespace n on n.oid = rel.relnamespace
       join pg_namespace nr on nr.oid = ref.relnamespace
      where c.contype = 'f' and n.nspname = 'public' and nr.nspname = 'public'`,
  );
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    if (child === parent) continue; // самоссылка не блокирует
    if (set.has(child) && set.has(parent)) deps.get(child)!.add(parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < tables.length) {
    const ready = tables.filter(
      (t) => !done.has(t) && [...deps.get(t)!].every((p) => done.has(p)),
    );
    if (ready.length === 0) {
      for (const t of tables) if (!done.has(t)) { order.push(t); done.add(t); }
      break;
    }
    for (const t of ready) { order.push(t); done.add(t); }
  }
  return order;
}

// setval из МАКСИМУМА цели после копирования: sequence → owning table.column
// (pg_depend). Пустая таблица → setval(seq, 1, false). Надёжнее last_value
// источника (тот мог отставать от max(id) или иметь другое имя).
async function fixSequences(target: Client, schema: string): Promise<void> {
  const { rows } = await target.query<{ seq: string; tbl: string; col: string }>(
    `select s.relname as seq, t.relname as tbl, a.attname as col
       from pg_class s
       join pg_namespace ns on ns.oid = s.relnamespace
       join pg_depend d on d.objid = s.oid and d.deptype in ('a','i')
       join pg_class t on t.oid = d.refobjid
       join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      where s.relkind = 'S' and ns.nspname = $1`,
    [schema],
  );
  for (const s of rows) {
    await target.query(
      `select setval(
         pg_get_serial_sequence('${schema}."${s.tbl}"', '${s.col}'),
         coalesce((select max("${s.col}") from ${schema}."${s.tbl}"), 1),
         (select count(*) > 0 from ${schema}."${s.tbl}"))`,
    );
  }
}

// Значение под bind: jsonb → JSON.stringify (иначе массив станет pg-массивом).
function bindValue(schema: string, table: string, col: string, val: unknown, jsonb: Set<string>): unknown {
  if (val != null && jsonb.has(`${table}.${col}`)) return JSON.stringify(val);
  return val;
}

async function copyTable(
  source: Client,
  target: Client,
  schema: string,
  table: string,
  columns: string[],
  hasIdentity: boolean,
  jsonb: Set<string>,
): Promise<number> {
  if (columns.length === 0) return 0;
  const qcol = (c: string) => `"${c}"`;
  const src = await source.query(
    `select ${columns.map(qcol).join(', ')} from ${schema}.${qcol(table)}`,
  );
  if (src.rows.length === 0) return 0;
  if (dryRun) return src.rows.length;

  const overriding = hasIdentity ? 'overriding system value ' : '';
  // Держимся ниже лимита pg в 65535 bind-параметров на запрос.
  const batch = Math.max(1, Math.floor(65000 / columns.length));
  for (let i = 0; i < src.rows.length; i += batch) {
    const chunk = src.rows.slice(i, i + batch);
    const values: unknown[] = [];
    const tuples = chunk.map((row: Record<string, unknown>, r) => {
      const ph = columns.map((c, k) => {
        values.push(bindValue(schema, table, c, row[c], jsonb));
        return `$${r * columns.length + k + 1}`;
      });
      return `(${ph.join(', ')})`;
    });
    await target.query(
      `insert into ${schema}.${qcol(table)} (${columns.map(qcol).join(', ')})
         ${overriding}values ${tuples.join(', ')}`,
      values,
    );
  }
  return src.rows.length;
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL_ADMIN_DIRECT;
  if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL не задан (прод-Supabase — ИСТОЧНИК)');
  if (!targetUrl) throw new Error('DATABASE_URL_ADMIN_DIRECT не задан (Neon — ЦЕЛЬ)');

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  const report: Array<[string, number]> = [];
  const dropped: string[] = [];
  try {
    // Пересечение колонок source∩target по каждой таблице (ревью C2): читаем
    // только то, что есть в ОБОИХ; source-only колонки логируем как потерю.
    const tgtPub = await tableColumns(target, 'public');
    const srcPub = await tableColumns(source, 'public');
    const tgtPriv = await tableColumns(target, 'private');
    const srcPriv = await tableColumns(source, 'private');
    const pubIdentity = await identityTables(target, 'public');
    const pubJsonb = await jsonbColumns(target, 'public');
    const privJsonb = await jsonbColumns(target, 'private');

    const intersectCols = (
      tgt: Map<string, string[]>, src: Map<string, string[]>, table: string, schema: string,
    ): string[] => {
      const srcCols = new Set(src.get(table) ?? []);
      const cols = (tgt.get(table) ?? []).filter((c) => srcCols.has(c));
      for (const c of tgt.get(table) ?? []) if (!srcCols.has(c)) dropped.push(`target-only ${schema}.${table}.${c}`);
      for (const c of srcCols) if (!(tgt.get(table) ?? []).includes(c)) dropped.push(`source-only ${schema}.${table}.${c}`);
      return cols;
    };

    const pubTables = (await baseTables(target, 'public')).filter((t) => tgtPub.has(t));
    // Расхождение набора таблиц (source-only = потеря; target-only ломает COPY).
    const srcTables = new Set(await baseTables(source, 'public'));
    for (const t of srcTables) if (!tgtPub.has(t)) dropped.push(`source-only table public.${t} (НЕ переносится)`);
    const order = await fkOrder(target, pubTables);

    if (!dryRun) await target.query('begin');

    // 1. auth.users ПЕРВЫМ (родитель public.users; ревью C1). NULL-хеш = СТОП.
    const authRows = await source.query<{ id: string; email: string; encrypted_password: string | null }>(
      `select id, email, encrypted_password from auth.users`,
    );
    const nullHash = authRows.rows.filter((u) => u.encrypted_password == null);
    if (nullHash.length > 0) {
      throw new Error(
        `auth.users: ${nullHash.length} строк с NULL encrypted_password — сотрудники не войдут. ` +
          `Разобрать до переноса (ревью C4). id: ${nullHash.slice(0, 5).map((u) => u.id).join(', ')}…`,
      );
    }
    if (!dryRun) {
      for (const u of authRows.rows) {
        await target.query(
          `insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)`,
          [u.id, u.email, u.encrypted_password],
        );
      }
    }
    report.push(['auth.users', authRows.rows.length]);

    if (!dryRun) {
      // 2. TRUNCATE baseline (id разойдутся с прод).
      for (const t of BASELINE_TABLES) {
        await target.query(`truncate table public."${t}" restart identity cascade`);
      }
      // 3. Глушим USER-триггеры на public + private.
      for (const t of order) await target.query(`alter table public."${t}" disable trigger user`);
      for (const t of tgtPriv.keys()) await target.query(`alter table private."${t}" disable trigger user`);
    }

    // 4. COPY public в FK-порядке (пересечение колонок).
    for (const t of order) {
      const cols = intersectCols(tgtPub, srcPub, t, 'public');
      const n = await copyTable(source, target, 'public', t, cols, pubIdentity.has(t), pubJsonb);
      report.push([`public.${t}`, n]);
    }

    // 4-бис. private-схема (user_login_secrets, app_crypto_key — иначе зеркала
    //        паролей нечитаемы владельцу; план §5 с7 п.2).
    const privIdentity = await identityTables(target, 'private');
    for (const [t] of tgtPriv) {
      const cols = intersectCols(tgtPriv, srcPriv, t, 'private');
      const n = await copyTable(source, target, 'private', t, cols, privIdentity.has(t), privJsonb);
      report.push([`private.${t}`, n]);
    }

    if (!dryRun) {
      // 5. Возвращаем триггеры; setval из МАКСИМУМА цели.
      for (const t of order) await target.query(`alter table public."${t}" enable trigger user`);
      for (const t of tgtPriv.keys()) await target.query(`alter table private."${t}" enable trigger user`);
      await fixSequences(target, 'public');
      await fixSequences(target, 'private');
      await target.query('commit');
      // ANALYZE — вне транзакции (эффект после commit).
      await target.query('analyze');
    }
  } catch (err) {
    if (!dryRun) await target.query('rollback').catch(() => {});
    throw err;
  } finally {
    await source.end();
    await target.end();
  }

  console.log(dryRun ? '\n[DRY-RUN] строк в источнике по таблицам:' : '\nПеренесено строк по таблицам:');
  let total = 0;
  for (const [t, n] of report) {
    if (n > 0) console.log(`  ${t.padEnd(34)} ${n}`);
    total += n;
  }
  console.log('─'.repeat(46));
  console.log(`  ${'ИТОГО'.padEnd(34)} ${total}`);
  if (dropped.length > 0) {
    console.log('\n⚠ Расхождение схем (колонки/таблицы вне пересечения):');
    for (const d of dropped) console.log(`  · ${d}`);
  }
  if (!dryRun) console.log('\nГотово. Следующий шаг — npm run verify:migration (стоп-гейт сверки).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
