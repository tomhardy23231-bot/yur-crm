// scripts/verify-migration.ts
// Стоп-гейт сверки данных после переноса (цикл v4, задача T7, сессия 7, п.3-бис).
// Сравнивает ИСТОЧНИК (прод-Supabase) и ЦЕЛЬ (Neon) построчно, по деньгам И по
// целостности паролей:
//   • COUNT(*) по каждой таблице public/private + auth.users (+ расхождение
//     набора таблиц: source-only = потеря, target-only = дыра переноса);
//   • контрольные суммы денежных полей ДО КОПЕЙКИ;
//   • контрольные суммы паролей (auth.users) и зеркал секретов
//     (private.user_login_secrets) — обнулённый/битый хеш даёт другой md5 (ревью
//     C4: без этого пустой пароль прошёл бы GREEN, а сотрудник не вошёл бы).
// Любое расхождение → exit 1 (СТОП, разбор до переключения трафика).
//
// Запуск: SOURCE_DATABASE_URL=…supabase npm run verify:migration
//   (цель — DATABASE_URL_ADMIN_DIRECT). Самопроверка логики: одна БД в обеих
//   строках → расхождений 0 (сверка идентична сама себе).

import { Client } from 'pg';

const SKIP_TABLES = new Set(['_migrations']);

// Денежные инварианты: [ярлык, SQL]. Σ до копейки должны совпасть.
const MONEY_CHECKS: Array<[string, string]> = [
  ['Σ payments.amount', `select coalesce(sum(amount),0)::text v from public.payments`],
  ['Σ cases.contract_sum', `select coalesce(sum(contract_sum),0)::text v from public.cases`],
  ['Σ cases.paid_total', `select coalesce(sum(paid_total),0)::text v from public.cases`],
  ['Σ cases.debt', `select coalesce(sum(debt),0)::text v from public.cases`],
  ['Σ cash_entries.amount', `select coalesce(sum(amount),0)::text v from public.cash_entries`],
  ['Σ payroll_transactions.amount', `select coalesce(sum(amount),0)::text v from public.payroll_transactions`],
  ['Σ case_acts.amount', `select coalesce(sum(amount),0)::text v from public.case_acts`],
  ['Σ payment_plan_items.amount', `select coalesce(sum(amount),0)::text v from public.payment_plan_items`],
];

// Целостность входа: md5 по (id + хеш пароля), упорядоченный по id. Отличие =
// потерянный/обнулённый/битый хеш = кто-то не войдёт.
const INTEGRITY_CHECKS: Array<[string, string]> = [
  ['md5 auth.users(id+pwd)', `select coalesce(md5(string_agg(id::text || coalesce(encrypted_password,''), '' order by id)),'∅') v from auth.users`],
  ['md5 login_secrets', `select coalesce(md5(string_agg(user_id::text || coalesce(encode(secret,'hex'),''), '' order by user_id)),'∅') v from private.user_login_secrets`],
];

async function baseTables(db: Client, schema: string): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = $1 and table_type = 'BASE TABLE' order by table_name`,
    [schema],
  );
  return rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));
}

async function count(db: Client, schema: string, table: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`select count(*)::text n from ${schema}."${table}"`);
  return Number(rows[0]!.n);
}

async function scalar(db: Client, sql: string): Promise<string> {
  const { rows } = await db.query<{ v: string }>(sql);
  return rows[0]!.v;
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

  let mismatches = 0;
  const row = (label: string, a: string | number, b: string | number) => {
    const okFlag = String(a) === String(b);
    if (!okFlag) mismatches++;
    console.log(`  ${okFlag ? '✓' : '✗'} ${label.padEnd(30)} source=${String(a).padStart(16)}  target=${String(b).padStart(16)}`);
  };

  try {
    // Расхождение набора таблиц (source-only = потеря данных, target-only = дыра).
    console.log('Набор таблиц:');
    for (const schema of ['public', 'private'] as const) {
      const src = new Set(await baseTables(source, schema));
      const tgt = new Set(await baseTables(target, schema));
      for (const t of src) if (!tgt.has(t)) { mismatches++; console.log(`  ✗ ${schema}.${t} есть в source, НЕТ в target — данные потеряются`); }
      for (const t of tgt) if (!src.has(t)) { mismatches++; console.log(`  ✗ ${schema}.${t} есть в target, НЕТ в source — проверить перенос`); }
    }

    console.log('\nCOUNT(*) по таблицам:');
    for (const schema of ['public', 'private'] as const) {
      const src = new Set(await baseTables(source, schema));
      for (const t of await baseTables(target, schema)) {
        if (!src.has(t)) continue; // расхождение набора уже учтено выше
        row(`${schema}.${t}`, await count(source, schema, t), await count(target, schema, t));
      }
    }
    row('auth.users', await count(source, 'auth', 'users'), await count(target, 'auth', 'users'));

    console.log('\nДенежные контрольные суммы:');
    for (const [label, sql] of MONEY_CHECKS) row(label, await scalar(source, sql), await scalar(target, sql));

    console.log('\nЦелостность входа (пароли/секреты):');
    for (const [label, sql] of INTEGRITY_CHECKS) row(label, await scalar(source, sql), await scalar(target, sql));
  } finally {
    await source.end();
    await target.end();
  }

  console.log('─'.repeat(72));
  if (mismatches > 0) {
    console.error(`\n✗ РАСХОЖДЕНИЙ: ${mismatches}. СТОП — разобрать до переключения трафика.`);
    process.exit(1);
  }
  console.log('\n✓ Сверка сошлась: строки, деньги и пароли идентичны. Можно переключать трафик.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
