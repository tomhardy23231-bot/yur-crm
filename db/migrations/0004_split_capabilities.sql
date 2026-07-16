-- 0004_split_capabilities.sql
-- Разделение составных прав на атомарные (запрос клиента, 2026-07-16):
--   edit_payments   («изменять и удалять платежи») → edit_payments (изменять)
--                                                  + delete_payments (удалять)
--   manage_users    («создавать сотрудников и менять роли/права»)
--                                                  → create_users (создавать)
--                                                  + manage_users (роли и права)
--   can_manage_cash («касса целиком»)              → view_cash (смотреть отчёт)
--                                                  + can_manage_cash (операции/счета)
--
-- Дефолты по ролям НЕ меняются: delete_payments/create_users — owner+admin,
-- view_cash — owner (грант, как у can_manage_cash, owner-only).
-- Существующие персональные переопределения копируются в новую половинку —
-- эффективное поведение ни у кого не меняется.
--
-- Зеркала в TS (та же правка): CAPABILITIES / CAP_ROLE_DEFAULTS /
-- OWNER_ONLY_CAPABILITIES / canGrantCapability в src/lib/types/db.ts.

-- ── 1. Дефолт права по роли (15 прав) ────────────────────────────────────────
create or replace function private.cap_role_default(p_cap text, p_role public.user_role) returns boolean
    language sql immutable
    set search_path to ''
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
    when p_cap = 'delete_payments'     then p_role in ('owner', 'admin')
    when p_cap = 'view_all_payroll'    then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'edit_rate_overrides' then p_role in ('owner', 'admin')
    when p_cap = 'create_users'        then p_role in ('owner', 'admin')
    when p_cap = 'manage_users'        then p_role in ('owner', 'admin')
    when p_cap = 'edit_payroll_rates'  then p_role = 'owner'
    when p_cap = 'view_cash'           then p_role = 'owner'
    when p_cap = 'can_manage_cash'     then p_role = 'owner'
    else false
  end
$$;

comment on function private.cap_role_default(p_cap text, p_role public.user_role) is
  'Дефолт права по роли (источник истины для эффективного права, зеркалится в TS capRoleDefault). Должна совпадать с TS. 2026-07-16: +delete_payments/+create_users/+view_cash (сплит составных прав).';

-- ── 2. Валидация ключей perm_overrides (15 прав) ─────────────────────────────
create or replace function private.validate_perm_overrides() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  k text;
  allowed text[] := array[
    'view_all_cases', 'create_cases', 'delete_cases',
    'create_clients', 'delete_clients', 'delete_documents',
    'edit_payments', 'delete_payments', 'view_all_payroll', 'edit_rate_overrides',
    'create_users', 'manage_users', 'edit_payroll_rates',
    'view_cash', 'can_manage_cash'
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

-- ── 3. Кто выдаёт право: view_cash — только владелец (как can_manage_cash) ──
create or replace function private.can_grant_cap(p_cap text, p_target uuid) returns boolean
    language plpgsql stable security definer
    set search_path to ''
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

  -- права кассы (просмотр И операции) выдаёт только владелец (PLAN-V2 §Касса)
  if p_cap in ('can_manage_cash', 'view_cash') and not private.is_owner() then
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

comment on function private.can_grant_cap(p_cap text, p_target uuid) is
  'Кто вправе менять конкретное право у конкретного пользователя. Ступенчатые права + анти-эскалация: нет self-edit, edit_payroll_rates — только owner, касса (view_cash/can_manage_cash) — только owner, manage_users — только owner/admin по роли, не-владелец не выдаёт чего не имеет.';

-- ── 4. RLS: удаление платежей — отдельное право ──────────────────────────────
alter policy payments_delete_managers on public.payments
  using (private.can('delete_payments'::text));

-- ── 5. RLS кассы: SELECT доступен и «только смотрящим» (view_cash) ───────────
alter policy cash_accounts_select on public.cash_accounts
  using (private.can('view_cash'::text) or private.can('can_manage_cash'::text));

alter policy cash_entries_select on public.cash_entries
  using (private.can('view_cash'::text) or private.can('can_manage_cash'::text));

comment on table public.cash_accounts is
  'Счета кассы (Карта/Рахунок/Готівка + добавляемые): kind, начальный остаток (opening_balance/opening_date), is_default — фолбэк автоприхода. SELECT — private.can(view_cash) или can(can_manage_cash); запись — только can_manage_cash. v2 Этап 7; сплит прав 2026-07-16.';

comment on table public.cash_entries is
  'Операции кассы: direction in/out, amount, entry_date, свободное описание. Авто-строки (payment_id NOT NULL) создаёт триггер автоприхода и пользователю на UPDATE/DELETE не отдаются (только система). SELECT — private.can(view_cash) или can(can_manage_cash); запись — только can_manage_cash. v2 Этап 7; сплит прав 2026-07-16.';

-- Перенос остатка для отчёта — доступен и смотрящему (view_cash).
create or replace function public.cash_balances_before(p_before date) returns table(account_id uuid, balance numeric)
    language sql security definer
    set search_path to ''
    as $$
  select e.account_id,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)
  from public.cash_entries e
  join public.cash_accounts a on a.id = e.account_id
  where e.entry_date < p_before
    and e.entry_date >= a.opening_date     -- операции до opening_date уже в opening_balance
    and (private.can('view_cash') or private.can('can_manage_cash'))  -- право внутри DEFINER
  group by e.account_id;
$$;

comment on function public.cash_balances_before(p_before date) is
  'Перенос остатка по счетам кассы строго до p_before (исключая операции раньше opening_date — они уже в opening_balance). Эффективный остаток на начало = cash_accounts.opening_balance + balance. Право view_cash ИЛИ can_manage_cash (сплит 2026-07-16). v3 s3.';

-- cash_backfill_payments / cash_unsynced_payments_count остаются под
-- can_manage_cash — это операции записи и сервисный баннер менеджера кассы.

-- ── 6. Бэкфилл персональных переопределений ──────────────────────────────────
-- Явный override старого права копируем в новую половинку — эффективное
-- поведение сотрудников не меняется (дальше настраивается раздельно).
-- Триггер guard_perm_overrides_change пропускает системный путь (auth.uid() null);
-- validate_perm_overrides уже знает новые ключи (заменён выше).
update public.users
set perm_overrides = perm_overrides
  || case when perm_overrides ? 'edit_payments'
       then jsonb_build_object('delete_payments', perm_overrides -> 'edit_payments')
       else '{}'::jsonb end
  || case when perm_overrides ? 'manage_users'
       then jsonb_build_object('create_users', perm_overrides -> 'manage_users')
       else '{}'::jsonb end
  || case when perm_overrides ? 'can_manage_cash'
       then jsonb_build_object('view_cash', perm_overrides -> 'can_manage_cash')
       else '{}'::jsonb end
where perm_overrides ?| array['edit_payments', 'manage_users', 'can_manage_cash'];
