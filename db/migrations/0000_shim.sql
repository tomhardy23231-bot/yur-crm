-- ============================================================================
-- 0000_shim.sql — шим совместимости Supabase → чистый Postgres (цикл v4, §4.1)
-- Прогоняется ПЕРВЫМ, до 0001_baseline.sql (очищенный слепок схемы Supabase).
-- Идемпотентен: роли/схемы/объекты создаются только при отсутствии.
--
-- Даёт baseline'у всё, на что тот ссылается из мира Supabase:
--
--   1. Роль authenticated — получатель всех GRANT из миграций — и login-роль
--      app_user IN ROLE authenticated, под которой ходят ВСЕ пользовательские
--      запросы приложения (user-пул, lib/db.ts). app_user НЕ владеет
--      таблицами → RLS применяется. Роли anon/service_role НЕ создаются:
--      гранты им вычищены из слепка (scripts/clean-schema-dump.mjs),
--      admin-путь = owner БД (владелец таблиц обходит RLS — аналог
--      service_role, только для machine-роутов/seed/миграций).
--
--   2. Схема auth: таблица auth.users (замена GoTrue; при переезде
--      переносятся id / email / encrypted_password — bcrypt-хеши совместимы)
--      + функция auth.uid(), читающая app.user_id, который выставляет
--      userDb-обёртка на каждую транзакцию:
--        set_config('app.user_id', <uuid>, true)
--      Забыли обёртку → auth.uid() = NULL → RLS отрезает всё (fail-closed).
--      Поля failed_attempts / locked_until — под rate-limit логина (сессия 2,
--      ревью V3-4). pwd_version добавляется в public.users миграцией
--      сессии 2 (public.users в момент шима ещё не существует).
--
--   3. Схема extensions + pgcrypto: DEFINER-функции user_login_secrets
--      зовут extensions.pgp_sym_encrypt / pgp_sym_decrypt схемо-
--      квалифицированно (ревью V3) — расширение обязано жить в этой схеме.
--
-- ⚠ auth.uid() обязана быть STABLE (и БЕЗ set search_path — он ломает
--   инлайнинг): иначе initplan-оптимизация RLS из миграции 20260611101200
--   молча деградирует в построчный вызов (ревью V3).
-- ============================================================================

-- 1. Роли --------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    -- LOGIN без пароля: пароль задаётся вне git (ALTER ROLE ... PASSWORD),
    -- см. docs/PLAN-V4-POSTGRES.md сессия 1. INHERIT (дефолт) — наследует
    -- гранты authenticated; NOBYPASSRLS (дефолт) — подчиняется RLS.
    -- ⚠ app_user создаётся ТОЛЬКО SQL'ем: роли из Neon Console/API входят
    -- в neon_superuser (BYPASSRLS) — это сломало бы всю модель доступа.
    create role app_user login;
  end if;
end
$$;

-- членство отдельно и идемпотентно (роль могла существовать до шима)
grant authenticated to app_user;

-- 2. Схема auth ---------------------------------------------------------------

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  encrypted_password text not null default '',
  failed_attempts    integer not null default 0,
  locked_until       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table auth.users is
  'Учётки входа (замена GoTrue auth.users). Источник истины пароля — '
  'encrypted_password (bcrypt). Доступ — ТОЛЬКО admin-пул (owner БД); '
  'app_user прав на таблицу не имеет.';

create unique index if not exists users_email_lower_key
  on auth.users (lower(email));

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

comment on function auth.uid() is
  'Шим GoTrue auth.uid(): uuid из GUC app.user_id, который выставляет '
  'userDb-обёртка (set_config на транзакцию). NULL вне обёртки → RLS '
  'fail-closed. STABLE обязателен для initplan-оптимизации RLS.';

-- app_user должен уметь ВЫЗВАТЬ auth.uid() (все политики на ней),
-- но НЕ читать auth.users: USAGE на схему ≠ права на таблицы.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

-- 3. Схема extensions + pgcrypto ----------------------------------------------

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Функции расширений исполняемы PUBLIC по умолчанию; USAGE на схему нужен,
-- чтобы invoker-код под app_user мог их резолвить (таблиц в схеме нет).
grant usage on schema extensions to authenticated;
