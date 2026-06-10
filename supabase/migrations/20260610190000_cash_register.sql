-- Юр CRM — v2 Этап 7: Касса и сальдо-отчёт. docs/PLAN-V2.md, Этап 7.
-- Образец: docs/samples/oborotka-olimp-sample.xls («Оборотно-сальдова відомість ОЛІМП»).
--
-- Модель (PLAN-V2 §Касса):
--   • cash_accounts — счета (Карта/Рахунок/Готівка + добавляемые), у счёта начальный
--     остаток (opening_balance) и дата (opening_date);
--   • cash_entries — журнал операций приход/расход за день, свободное описание
--     (аренда, налоги, реклама — НЕ привязаны к делам); платежи по делам АВТОМАТОМ
--     падают приходом на счёт по маппингу payments.method → счёт;
--   • сальдо считается накопительно от opening_balance/opening_date (в TS — lib/cash/saldo.ts,
--     под юнит-тест по контрольному примеру ОЛІМП).
--
-- ДОСТУП — РОЛЕВОЙ ЧЕРЕЗ CAP (PLAN-V2: «по умолчанию только owner; owner выдаёт право
-- точечно»). Реализуем как 12-е настраиваемое право `can_manage_cash` в существующей
-- системе perm_overrides (20260601100000), а НЕ как отдельную boolean-колонку: так
-- касса автоматически попадает в редактор прав, в private.can(...) и в TS-зеркало.
-- Дефолт права — ТОЛЬКО owner (как edit_payroll_rates); выдаёт его тоже только owner
-- (can_grant_cap, owner-only ветка). RLS на обе таблицы = private.can('can_manage_cash').
--
-- АВТОПРИХОД (PLAN-V2): триггер на public.payments (SECURITY DEFINER — обходит RLS
-- кассы, т.к. платёж вносит юрист/Експерт БЕЗ can_manage_cash) поддерживает 1:1
-- связанную строку cash_entries(direction='in'). Счёт выбирается маппингом
-- payments.method → kind (card/bank/cash; 'act' → bank) с фолбэком на дефолтный счёт;
-- если ни одного активного счёта не нашлось — операция ПРОПУСКАЕТСЯ (триггер НЕ падает,
-- иначе сломал бы внесение любого платежа до настройки касс). Удаление платежа →
-- cash_entries.payment_id ON DELETE CASCADE снимает связанную строку; правка платежа →
-- строка пересоздаётся. Ручные строки (payment_id IS NULL) правит/удаляет cash-manager;
-- авто-строки (payment_id NOT NULL) — только система (RLS их пользователю не отдаёт на
-- UPDATE/DELETE).
--
-- Миграция АДДИТИВНАЯ: 2 новые таблицы + расширение 3 функций прав (create or replace,
-- весь прежний allowlist сохранён) + триггер на payments. activity_log НЕ трогаем
-- (касса — не «по делам»; DoD §7 логирование не требует) → гоча allowlist 23514 не задета.
--
-- Откат: drop trigger cash_sync_on_payment on public.payments; drop function
--   private.cash_sync_on_payment(), private.cash_resolve_account(text),
--   private.cash_kind_for_method(text); drop table public.cash_entries, public.cash_accounts;
--   вернуть прежние тела cap_role_default / validate_perm_overrides / can_grant_cap
--   (без 'can_manage_cash'). Существующие данные миграция не разрушает.

-- ========================================================================
-- 1) Право can_manage_cash в системе perm_overrides
-- ========================================================================
-- 1.1 Дефолт права по роли — добавляем can_manage_cash (owner-only, как edit_payroll_rates).
--     Тело 1:1 повторяет 20260601100000 + одна ветка; зеркалится в TS CAP_ROLE_DEFAULTS.
create or replace function private.cap_role_default(p_cap text, p_role public.user_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role is null then false
    when p_cap = 'view_all_cases'      then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'create_cases'        then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'delete_cases'        then p_role in ('owner', 'admin')
    when p_cap = 'create_clients'      then p_role in ('owner', 'admin', 'office_manager', 'lawyer')
    when p_cap = 'delete_clients'      then p_role in ('owner', 'admin')
    when p_cap = 'delete_documents'    then p_role in ('owner', 'admin')
    when p_cap = 'edit_payments'       then p_role in ('owner', 'admin')
    when p_cap = 'view_all_payroll'    then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'edit_rate_overrides' then p_role in ('owner', 'admin')
    when p_cap = 'manage_users'        then p_role in ('owner', 'admin')
    when p_cap = 'edit_payroll_rates'  then p_role = 'owner'
    when p_cap = 'can_manage_cash'     then p_role = 'owner'
    else false
  end
$$;

-- 1.2 Валидация формы perm_overrides — расширяем allowlist ключей (+ can_manage_cash).
create or replace function private.validate_perm_overrides()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  allowed text[] := array[
    'view_all_cases', 'create_cases', 'delete_cases',
    'create_clients', 'delete_clients', 'delete_documents',
    'edit_payments', 'view_all_payroll', 'edit_rate_overrides',
    'manage_users', 'edit_payroll_rates', 'can_manage_cash'
  ];
begin
  if new.perm_overrides is null then
    new.perm_overrides := '{}'::jsonb;
  end if;
  if jsonb_typeof(new.perm_overrides) <> 'object' then
    raise exception 'perm_overrides must be a JSON object'
      using errcode = 'P0001', hint = 'perm_overrides_shape';
  end if;
  for k in select jsonb_object_keys(new.perm_overrides) loop
    if not (k = any(allowed)) then
      raise exception 'unknown capability override: %', k
        using errcode = 'P0001', hint = 'perm_overrides_unknown_key';
    end if;
    if jsonb_typeof(new.perm_overrides -> k) <> 'boolean' then
      raise exception 'capability % must be boolean', k
        using errcode = 'P0001', hint = 'perm_overrides_not_boolean';
    end if;
  end loop;
  return new;
end;
$$;

-- 1.3 Кто вправе выдавать/снимать право — can_manage_cash выдаёт ТОЛЬКО владелец
--     (как edit_payroll_rates). Тело 1:1 повторяет 20260601100000 + одна ветка.
create or replace function private.can_grant_cap(p_cap text, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target_role public.user_role;
begin
  select role into v_target_role from public.users where id = p_target;
  if v_target_role is null then
    return false;
  end if;

  -- нельзя редактировать собственные права
  if p_target = auth.uid() then
    return false;
  end if;

  -- зона управления (включает проверку manage_users у актора)
  if not private.can_manage_target_user(v_target_role) then
    return false;
  end if;

  -- системные ставки зарплаты выдаёт только владелец
  if p_cap = 'edit_payroll_rates' and not private.is_owner() then
    return false;
  end if;

  -- управление кассой выдаёт только владелец (PLAN-V2 §Касса)
  if p_cap = 'can_manage_cash' and not private.is_owner() then
    return false;
  end if;

  -- право «управление пользователями» выдают только owner/admin по роли
  if p_cap = 'manage_users'
     and private.current_user_role() not in ('owner', 'admin') then
    return false;
  end if;

  -- анти-амплификация: не-владелец не выдаёт право, которого нет у него самого
  if not private.is_owner() and not private.can(p_cap) then
    return false;
  end if;

  return true;
end;
$$;

-- ========================================================================
-- 2) Таблица cash_accounts — счета кассы
-- ========================================================================
create table public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- card = Карта, bank = Рахунок (р/с), cash = Готівка. Тип нужен для маппинга
  -- payments.method → счёт автоприхода (см. private.cash_kind_for_method).
  kind            text not null default 'bank',
  opening_balance numeric(14, 2) not null default 0,
  opening_date    date not null default current_date,
  is_active       boolean not null default true,
  -- Дефолтный счёт-фолбэк для автоприхода, когда method не лёг ни на один kind
  -- (≤1 на всю компанию). Обычно — Рахунок.
  is_default      boolean not null default false,
  created_by      uuid not null references public.users(id) on delete restrict,
  created_at      timestamptz not null default now(),

  constraint cash_accounts_kind_valid check (kind in ('card', 'bank', 'cash'))
);

create index cash_accounts_active_idx on public.cash_accounts(is_active);
-- Не более одного дефолтного счёта на компанию.
create unique index cash_accounts_one_default on public.cash_accounts(is_default)
  where is_default;

comment on table public.cash_accounts is
  'Счета кассы (Карта/Рахунок/Готівка + добавляемые): kind, начальный остаток '
  '(opening_balance/opening_date), is_default — фолбэк автоприхода. Доступ '
  'private.can(can_manage_cash). v2 Этап 7.';

-- ========================================================================
-- 3) Таблица cash_entries — журнал операций
-- ========================================================================
create table public.cash_entries (
  id          uuid primary key default gen_random_uuid(),
  -- RESTRICT: нельзя удалить счёт с операциями (используется деактивация is_active).
  account_id  uuid not null references public.cash_accounts(id) on delete restrict,
  entry_date  date not null,
  direction   text not null,                 -- in (приход) | out (расход)
  amount      numeric(14, 2) not null,
  description text not null,
  -- Привязка к делу/платежу — только у авто-строк (приход от оплаты по делу).
  -- case_id SET NULL (платежи всё равно держат дело через RESTRICT); payment_id
  -- CASCADE — удаление платежа снимает связанную строку кассы (откат автоприхода).
  case_id     uuid references public.cases(id) on delete set null,
  payment_id  uuid references public.payments(id) on delete cascade,
  created_by  uuid not null references public.users(id) on delete restrict,
  created_at  timestamptz not null default now(),

  constraint cash_entries_direction_valid check (direction in ('in', 'out')),
  constraint cash_entries_amount_positive check (amount > 0),
  constraint cash_entries_desc_len        check (char_length(description) <= 300)
);

create index cash_entries_account_date_idx on public.cash_entries(account_id, entry_date);
-- Один авто-приход на платёж (правка платежа пересоздаёт строку — см. триггер).
create unique index cash_entries_payment_uniq on public.cash_entries(payment_id)
  where payment_id is not null;

comment on table public.cash_entries is
  'Операции кассы: direction in/out, amount, entry_date, свободное описание. '
  'Авто-строки (payment_id NOT NULL) создаёт триггер автоприхода и пользователю на '
  'UPDATE/DELETE не отдаются (только система). Доступ private.can(can_manage_cash). '
  'v2 Этап 7.';

-- ========================================================================
-- 4) RLS — всё по праву can_manage_cash (owner имеет его по дефолту роли)
-- ========================================================================
alter table public.cash_accounts enable row level security;
alter table public.cash_entries  enable row level security;

-- cash_accounts: чтение/правка/удаление — cap; вставка — cap + created_by без спуфа.
create policy cash_accounts_select on public.cash_accounts
  for select to authenticated
  using (private.can('can_manage_cash'));

create policy cash_accounts_insert on public.cash_accounts
  for insert to authenticated
  with check (
    private.can('can_manage_cash')
    and created_by = (select private.active_uid())
  );

create policy cash_accounts_update on public.cash_accounts
  for update to authenticated
  using      (private.can('can_manage_cash'))
  with check (private.can('can_manage_cash'));

create policy cash_accounts_delete on public.cash_accounts
  for delete to authenticated
  using (private.can('can_manage_cash'));

-- cash_entries: чтение — cap. Вставка — cap + created_by без спуфа + ТОЛЬКО ручные
-- строки (payment_id IS NULL); авто-строки заводит лишь SECURITY DEFINER-триггер.
-- UPDATE/DELETE — cap И только ручные строки (авто-приход правится через сам платёж).
create policy cash_entries_select on public.cash_entries
  for select to authenticated
  using (private.can('can_manage_cash'));

create policy cash_entries_insert on public.cash_entries
  for insert to authenticated
  with check (
    private.can('can_manage_cash')
    and created_by = (select private.active_uid())
    and payment_id is null
  );

create policy cash_entries_update on public.cash_entries
  for update to authenticated
  using      (private.can('can_manage_cash') and payment_id is null)
  with check (private.can('can_manage_cash') and payment_id is null);

create policy cash_entries_delete on public.cash_entries
  for delete to authenticated
  using (private.can('can_manage_cash') and payment_id is null);

-- ========================================================================
-- 5) Автоприход: маппинг method → счёт и его поддержка триггером на payments
-- ========================================================================
-- 5.1 payments.method (свободный текст; в коде — 'card'/'bank'/'cash'/'act') → kind счёта.
--     'act' (оплата по акту) трактуем как поступление на расчётный счёт (bank).
create or replace function private.cash_kind_for_method(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_method, ''))
    when 'card' then 'card'
    when 'bank' then 'bank'
    when 'cash' then 'cash'
    when 'act'  then 'bank'
    else null
  end
$$;

-- 5.2 Резолвер счёта автоприхода: активный счёт по kind метода (приоритет дефолтного),
--     иначе — глобальный дефолтный счёт; иначе NULL (нет настроенных касс → пропуск).
create or replace function private.cash_resolve_account(p_method text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select a.id from public.cash_accounts a
       where a.is_active
         and a.kind = private.cash_kind_for_method(p_method)
       order by a.is_default desc, a.created_at asc
       limit 1
    ),
    (
      select a.id from public.cash_accounts a
       where a.is_active and a.is_default
       order by a.created_at asc
       limit 1
    )
  )
$$;

-- 5.3 Триггерная функция: поддерживает 1:1 авто-приход для платежа.
--     SECURITY DEFINER — платёж вносит юрист/Експерт без can_manage_cash, а строку
--     кассы всё равно надо создать (обходим RLS cash_entries). НИКОГДА не падает на
--     отсутствии касс — иначе заблокировала бы внесение любого платежа.
create or replace function private.cash_sync_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_title   text;
  v_desc    text;
begin
  -- РЕЗОЛВИМ счёт ПЕРВЫМ — и только потом трогаем cash_entries. Иначе на UPDATE,
  -- если платёж отредактировали в метод без счёта (method=NULL и нет дефолтного счёта),
  -- мы бы удалили прежнюю авто-строку и НЕ создали новую → молчаливая потеря прихода
  -- (находка адвер-ревью HIGH). Резолв до DELETE гарантирует: строку удаляем, только
  -- если есть куда переложить приход.
  v_account := private.cash_resolve_account(new.method);
  if v_account is null then
    -- Касс нет / метод не лёг ни на один счёт. INSERT — тихо пропускаем (платёж
    -- проходит, DoD: триггер не падает). UPDATE — НЕ удаляем прежнюю строку (сохраняем
    -- ранее зафиксированный приход), просто выходим.
    return null;
  end if;

  -- Счёт известен. На UPDATE пересоздаём строку (сумма/дата/счёт могли смениться).
  if tg_op = 'UPDATE' then
    delete from public.cash_entries where payment_id = new.id;
  end if;

  select number_title into v_title from public.cases where id = new.case_id;
  v_desc := coalesce(
    nullif(btrim(new.note), ''),
    'Оплата по справі' || coalesce(': ' || v_title, '')
  );

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id, created_by)
  values
    (v_account, new.paid_at, 'in', new.amount, left(v_desc, 300), new.case_id, new.id, new.created_by);

  return null;
end;
$$;

-- AFTER INSERT/UPDATE — авто-приход. DELETE покрыт FK payment_id ON DELETE CASCADE
-- (отдельный триггер не нужен; согласован с case_acts_revert_on_payment_delete,
-- который BEFORE DELETE на payments — порядок не конфликтует).
create trigger cash_sync_on_payment
  after insert or update on public.payments
  for each row execute function private.cash_sync_on_payment();

-- ========================================================================
-- 6) Гард неизменности аудит-полей (created_by/created_at) при UPDATE
-- ========================================================================
-- Защита аудит-следа финансовых записей (находка адвер-ревью MEDIUM): обладатель
-- can_manage_cash через сырой клиент мог бы переписать created_by счёта/операции в
-- обход серверного действия (которое эти поля не шлёт). RLS WITH CHECK тут не подходит
-- (требование created_by = active_uid сломало бы правку чужого счёта ДРУГИМ
-- cash-manager'ом). Поэтому просто пиним created_by/created_at к прежним значениям —
-- любые попытки их сменить молча игнорируются. По образцу users_guard_*-триггеров.
create or replace function private.cash_guard_immutable_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger cash_accounts_guard_audit
  before update on public.cash_accounts
  for each row execute function private.cash_guard_immutable_audit();

create trigger cash_entries_guard_audit
  before update on public.cash_entries
  for each row execute function private.cash_guard_immutable_audit();

-- ========================================================================
-- 7) Grants
-- ========================================================================
grant execute on function private.cash_kind_for_method(text) to authenticated;
grant execute on function private.cash_resolve_account(text) to authenticated;
