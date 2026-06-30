-- Юр CRM — Управление доступами сотрудника владельцем (модалка «логин/пароль»).
--
-- Что закрываем (запрос пользователя):
--   1) Владелец видит логин (email) сотрудника и МОЖЕТ выдать новый пароль —
--      пароль показывается в модалке. Текущий пароль показать нельзя (в auth он
--      хеш), поэтому храним ЗЕРКАЛО последнего пароля, выданного через панель:
--      private.user_login_secrets (зашифровано pgcrypto, читает только owner).
--   2) Удаление сотрудника. При наличии истории удалять нельзя (FK RESTRICT на
--      cases/payments/...): public.user_delete_blockers() считает связанные записи,
--      сервер удаляет только «чистые» учётки (иначе — деактивация).
--   3) Журнал: + user_password_reset / user_email_changed / user_invited /
--      user_deleted (entity_type='user', гейт can('manage_users') — как прочие user_*).
--
-- Модель приватности — ЗЕРКАЛО подхода к зарплатам (§5 CLAUDE.md): секрет лежит в
-- схеме private (НЕ доступна PostgREST), читается ТОЛЬКО через owner-gated DEFINER.
-- service_role-путь (создание/смена пароля в auth) дублирует owner-проверку в коде.

-- ========================================================================
-- 0) pgcrypto (для симметричного шифрования зеркала пароля)
-- ========================================================================
create extension if not exists pgcrypto with schema extensions;

-- ========================================================================
-- 1) Случайный ключ шифрования (private, single-row, генерится один раз)
-- ========================================================================
-- Ключ НЕ в git: генерится gen_random_bytes при первом применении миграции.
-- Доступ — только DEFINER-функции (anon/authenticated отрезаны).
create table if not exists private.app_crypto_key (
  id  boolean primary key default true,
  key text not null,
  constraint app_crypto_key_singleton check (id)
);

insert into private.app_crypto_key (id, key)
  values (true, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (id) do nothing;

revoke all on private.app_crypto_key from anon, authenticated;

-- ========================================================================
-- 2) Зеркало пароля сотрудника (owner-managed), зашифровано
-- ========================================================================
create table if not exists private.user_login_secrets (
  user_id    uuid primary key references public.users(id) on delete cascade,
  secret     bytea not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

revoke all on private.user_login_secrets from anon, authenticated;

comment on table private.user_login_secrets is
  'Зеркало последнего пароля, выданного владельцем через панель управления '
  'пользователями. Зашифровано pgcrypto (ключ — private.app_crypto_key). Читает '
  'ТОЛЬКО owner через public.get_user_login_secret. НЕ источник истины для входа '
  '(им остаётся auth.users) — может разойтись, если сотрудник сменил пароль сам.';

-- ========================================================================
-- 3) Запись зеркала пароля — owner-only DEFINER
-- ========================================================================
-- Вызывается из server-action под СЕССИЕЙ владельца (is_owner работает). Сам
-- пароль в auth.users ставит admin.auth.admin.updateUserById (service_role) —
-- здесь только зеркало для показа.
create or replace function public.set_user_login_secret(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not private.is_owner() then
    raise exception 'only owner can manage login secrets' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) = 0 then
    raise exception 'empty password';
  end if;
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'user not found';
  end if;

  select key into v_key from private.app_crypto_key where id;

  insert into private.user_login_secrets (user_id, secret, updated_at, updated_by)
  values (p_user_id, extensions.pgp_sym_encrypt(p_password, v_key), now(), private.active_uid())
  on conflict (user_id) do update
    set secret = excluded.secret,
        updated_at = now(),
        updated_by = excluded.updated_by;
end;
$$;

grant execute on function public.set_user_login_secret(uuid, text) to authenticated;

-- ========================================================================
-- 4) Чтение зеркала пароля — owner-only DEFINER
-- ========================================================================
create or replace function public.get_user_login_secret(p_user_id uuid)
returns table (password text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not private.is_owner() then
    raise exception 'only owner can read login secrets' using errcode = '42501';
  end if;

  select key into v_key from private.app_crypto_key where id;

  return query
    select extensions.pgp_sym_decrypt(s.secret, v_key)::text, s.updated_at
    from private.user_login_secrets s
    where s.user_id = p_user_id;
end;
$$;

grant execute on function public.get_user_login_secret(uuid) to authenticated;

-- ========================================================================
-- 5) Блокеры удаления сотрудника — считаем связанную историю
-- ========================================================================
-- can_delete=true только если НЕТ ни одной записи в таблицах с FK RESTRICT на
-- users. Это превентивная проверка для дружелюбного сообщения; реальный страж —
-- сами FK RESTRICT (даже если тут что-то упустим, БД не даст удалить).
create or replace function public.user_delete_blockers(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cases     int;
  v_clients   int;
  v_payments  int;
  v_documents int;
  v_tasks     int;
  v_acts      int;
  v_comments  int;
  v_cash      int;
  v_payroll   int;
  v_total     int;
begin
  -- owner-only: вся фича управления доступами owner-gated; блокеры удаления —
  -- тоже (не can(manage_users), иначе admin читал бы счётчики истории чужих
  -- сотрудников через PostgREST поверх скоупа подразделений). Security-ревью №1.
  if not private.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_cases
    from public.cases where lawyer_id = p_user_id or responsible_id = p_user_id;
  select count(*) into v_clients   from public.clients   where created_by = p_user_id;
  select count(*) into v_payments  from public.payments  where created_by = p_user_id;
  select count(*) into v_documents from public.documents where uploaded_by = p_user_id;
  select count(*) into v_tasks
    from public.tasks where assignee_id = p_user_id or created_by = p_user_id;
  select count(*) into v_acts     from public.case_acts     where created_by = p_user_id;
  select count(*) into v_comments from public.case_comments where author_id = p_user_id;
  select count(*) into v_cash     from public.cash_entries  where created_by = p_user_id;
  select count(*) into v_payroll  from public.payroll_transactions where user_id = p_user_id;
  v_payroll := v_payroll + (select count(*) from public.payroll_ledger where user_id = p_user_id);

  v_total := v_cases + v_clients + v_payments + v_documents + v_tasks
           + v_acts + v_comments + v_cash + v_payroll;

  return jsonb_build_object(
    'can_delete', v_total = 0,
    'total',      v_total,
    'cases',      v_cases,
    'clients',    v_clients,
    'payments',   v_payments,
    'documents',  v_documents,
    'tasks',      v_tasks,
    'acts',       v_acts,
    'comments',   v_comments,
    'cash',       v_cash,
    'payroll',    v_payroll
  );
end;
$$;

grant execute on function public.user_delete_blockers(uuid) to authenticated;

-- ========================================================================
-- 6) activity_log: + user_password_reset / user_email_changed /
--    user_invited / user_deleted
-- ========================================================================
-- ⚠ ГОЧА allowlist (SQLSTATE 23514): пересоздаём CHECK + log_activity ПОВЕРХ
-- 20260611101900_v3_activity_payment_plan → сохраняем ВЕСЬ прежний allowlist
-- целиком, добавляем 4 user-действия. entity_type-список НЕ меняем (user уже есть).
alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'case_archived', 'case_restored', 'case_lost',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_updated', 'payment_deleted',
    'payment_plan_updated',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted', 'payroll_payout',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'user_password_reset', 'user_email_changed', 'user_invited', 'user_deleted',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated',
    'act_created', 'act_paid', 'act_deleted'
  ));

create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_changes     jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_is_delete_action boolean;
begin
  if p_entity_type is null or p_entity_id is null or p_action is null then
    return;
  end if;

  -- CSO #1: allowlist actions. 'stage_corrected' исключён (только триггер).
  if p_action not in (
    'case_created', 'case_updated', 'case_deleted', 'case_lost',
    'case_archived', 'case_restored',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_updated', 'payment_deleted',
    'payment_plan_updated',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted', 'payroll_payout',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'user_password_reset', 'user_email_changed', 'user_invited', 'user_deleted',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated',
    'act_created', 'act_paid', 'act_deleted'
  ) then
    return;
  end if;

  -- CSO #1: size cap на changes — защита от спама большими jsonb-payload'ами.
  if p_changes is not null and octet_length(p_changes::text) > 8192 then
    return;
  end if;

  v_uid := private.active_uid();
  if v_uid is null then
    return;
  end if;

  if p_entity_type not in ('case', 'client', 'user', 'department') then
    return;
  end if;

  v_is_delete_action := p_action in ('case_deleted', 'client_deleted');

  if v_is_delete_action then
    if p_action = 'case_deleted' and not private.can('delete_cases') then
      return;
    end if;
    if p_action = 'client_deleted' and not private.can('delete_clients') then
      return;
    end if;
  else
    if p_entity_type = 'case' and not private.can_see_case(p_entity_id) then
      return;
    end if;

    if p_entity_type = 'client' and not private.is_staff() then
      return;
    end if;

    -- события по пользователям видит/пишет только обладатель manage_users
    -- (user_deleted сюда же: entity_id уже не существует, но гейт строку не читает).
    if p_entity_type = 'user' and not private.can('manage_users') then
      return;
    end if;

    -- структуру компании (подразделения) меняет/видит только owner.
    if p_entity_type = 'department' and not private.is_owner() then
      return;
    end if;
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  -- Логирование никогда не должно ломать основную операцию.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Управление доступами: + user_password_reset/user_email_changed/user_invited/'
  'user_deleted (entity_type user, гейт can(manage_users)). Прежний allowlist '
  'сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';
