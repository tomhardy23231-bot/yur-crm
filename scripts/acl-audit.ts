// ACL-аудит базы (цикл v4, ревью V3-3) — гейт сессии 1 и каждого прогона
// миграций на новую базу. Известная грабля проекта: потерянные DML-гранты
// (memory: reset grants) не видны глазами, но кладут всё приложение.
//
// Запуск: npm run db:acl-audit (DATABASE_URL_ADMIN_DIRECT).
// Выход 1 = есть нарушения; печатает каждое.
//
// Проверки:
//  1. Каждая public-таблица: DML-гранты authenticated (иначе экраны падают);
//     ИСКЛЮЧЕНИЯ: users — табличный SELECT ЗАКРЫТ (колоночная приватность),
//     _migrations — грантов НЕТ вовсе (канарейка против blanket-GRANT:
//     «GRANT ALL ON ALL TABLES» немедленно вскроет и её, и salary_*).
//  2. users: открытые колонки читаемы, salary_* — НЕТ (column-level privacy).
//  3. Схема private недоступна app_user; auth — только USAGE + execute uid(),
//     таблица auth.users недоступна.
//  4. RLS включён на всех public-таблицах (кроме _migrations).

import { Client } from 'pg';

const OPEN_USER_COLUMNS = [
  'id',
  'full_name',
  'email',
  'role',
  'is_active',
  'created_at',
  'perm_overrides',
  'language',
  'department_id',
  'position',
  'visibility_scope',
];
const PRIVATE_USER_COLUMNS = ['salary_mode', 'salary_fixed_amount'];
// таблицы без грантов authenticated (доступ только owner/admin-пул)
const NO_GRANT_TABLES = new Set(['_migrations']);
// таблицы без RLS (служебные, недоступны app_user по грантам)
const NO_RLS_TABLES = new Set(['_migrations']);

const violations: string[] = [];

function check(ok: boolean, message: string) {
  if (!ok) violations.push(message);
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN_DIRECT;
  if (!url) throw new Error('DATABASE_URL_ADMIN_DIRECT не задан');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const tables: Array<{ name: string; rls: boolean }> = (
      await db.query(`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1`)
    ).rows.map((r) => ({ name: r.name as string, rls: r.rls as boolean }));

    check(tables.length >= 20, `public-таблиц ${tables.length} < 20 — база пустая?`);

    for (const t of tables) {
      const priv = (
        await db.query(
          `select
             has_table_privilege('authenticated', format('public.%I', $1::text), 'select') as sel,
             has_table_privilege('authenticated', format('public.%I', $1::text), 'insert') as ins,
             has_table_privilege('authenticated', format('public.%I', $1::text), 'update') as upd,
             has_table_privilege('authenticated', format('public.%I', $1::text), 'delete') as del`,
          [t.name],
        )
      ).rows[0] as { sel: boolean; ins: boolean; upd: boolean; del: boolean };

      if (NO_GRANT_TABLES.has(t.name)) {
        check(
          !priv.sel && !priv.ins && !priv.upd && !priv.del,
          `${t.name}: у authenticated ЕСТЬ права (${JSON.stringify(priv)}) — канарейка blanket-GRANT!`,
        );
      } else if (t.name === 'users') {
        check(!priv.sel, 'users: табличный SELECT открыт — колоночная приватность сломана');
      } else {
        check(priv.sel, `${t.name}: нет SELECT у authenticated — приложение ослепнет`);
        check(
          priv.ins && priv.upd && priv.del,
          `${t.name}: неполные DML-гранты authenticated (${JSON.stringify(priv)})`,
        );
      }

      const expectRls = !NO_RLS_TABLES.has(t.name);
      check(
        t.rls === expectRls,
        `${t.name}: RLS ${t.rls ? 'включён' : 'ВЫКЛЮЧЕН'}, ожидалось ${expectRls ? 'включён' : 'выключен'}`,
      );
    }

    for (const col of OPEN_USER_COLUMNS) {
      const r = (
        await db.query(
          `select has_column_privilege('authenticated','public.users',$1,'select') as ok`,
          [col],
        )
      ).rows[0];
      check(r.ok === true, `users.${col}: колонка ЗАКРЫТА для authenticated (экраны сломаются)`);
    }
    for (const col of PRIVATE_USER_COLUMNS) {
      const r = (
        await db.query(
          `select has_column_privilege('authenticated','public.users',$1,'select') as ok`,
          [col],
        )
      ).rows[0];
      check(r.ok === false, `users.${col}: ПРИВАТНАЯ колонка ОТКРЫТА — утечка зарплат!`);
    }

    const schemas = (
      await db.query(`
        select
          has_schema_privilege('app_user','private','usage') as private_usage,
          has_schema_privilege('app_user','auth','usage') as auth_usage,
          has_table_privilege('app_user','auth.users','select') as auth_users_select,
          has_function_privilege('app_user','auth.uid()','execute') as uid_exec,
          exists(select 1 from pg_roles where rolname='app_user'
                 and rolcanlogin and not rolsuper and not rolbypassrls) as app_user_ok`)
    ).rows[0];
    check(schemas.private_usage === false, 'схема private ДОСТУПНА app_user');
    check(schemas.auth_usage === true, 'схема auth недоступна app_user — auth.uid() не вызвать');
    check(schemas.auth_users_select === false, 'auth.users ЧИТАЕМА app_user — утечка хешей!');
    check(schemas.uid_exec === true, 'auth.uid() не исполняема app_user — RLS ляжет');
    check(
      schemas.app_user_ok === true,
      'app_user: нет роли, либо superuser/bypassrls/nologin — модель доступа сломана',
    );
  } finally {
    await db.end();
  }

  if (violations.length > 0) {
    console.error(`ACL-АУДИТ ПРОВАЛЕН — нарушений: ${violations.length}`);
    for (const v of violations) console.error('  ✗ ' + v);
    process.exit(1);
  }
  console.log('ACL-аудит: чисто (таблицы, колонки users, private/auth, RLS)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
