--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accrual_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.accrual_mode AS ENUM (
    'on_completion',
    'per_payment'
);


--
-- Name: billing_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_type AS ENUM (
    'prepaid',
    'installments',
    'fixed',
    'success_fee'
);


--
-- Name: case_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_category AS ENUM (
    'document',
    'claim',
    'representation'
);


--
-- Name: case_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_priority AS ENUM (
    'normal',
    'urgent'
);


--
-- Name: case_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_stage AS ENUM (
    'new_request',
    'consultation',
    'in_progress',
    'awaiting_decision',
    'closed'
);


--
-- Name: case_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.case_type AS ENUM (
    'civil',
    'criminal',
    'corporate',
    'administrative',
    'family',
    'labor',
    'other'
);


--
-- Name: client_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.client_kind AS ENUM (
    'individual',
    'company',
    'entrepreneur'
);


--
-- Name: client_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.client_source AS ENUM (
    'website',
    'referral',
    'advertising',
    'repeat',
    'other'
);


--
-- Name: doc_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.doc_type AS ENUM (
    'contract',
    'claim',
    'power_of_attorney',
    'correspondence',
    'act',
    'other'
);


--
-- Name: task_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_kind AS ENUM (
    'task',
    'hearing',
    'deadline'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'open',
    'done'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'admin',
    'office_manager',
    'lawyer',
    'expert'
);


--
-- Name: absence_can_write(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.absence_can_write(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    p_user_id = private.active_uid()
    or private.is_owner()
    or (
      private.current_user_role() = 'admin'
      and (
        private.scope_is_all()
        or exists (
          select 1
            from public.users u
           where u.id = p_user_id
             and u.department_id is not null
             and u.department_id = private.current_user_department()
        )
      )
    )
$$;


--
-- Name: absence_user_visible(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.absence_user_visible(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    p_user_id = private.active_uid()
    or private.is_owner()
    or private.scope_is_all()
    or (
      private.current_user_role() in ('admin', 'office_manager')
      and exists (
        select 1
          from public.users u
         where u.id = p_user_id
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;


--
-- Name: absences_no_overlap(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.absences_no_overlap() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (
    select 1 from public.absences a
    where a.user_id = new.user_id
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.starts_on <= new.ends_on
      and a.ends_on   >= new.starts_on
  ) then
    raise exception 'absence period overlaps an existing one for this user'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;


--
-- Name: active_uid(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.active_uid() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from public.users where id = auth.uid() and is_active = true
$$;


--
-- Name: can(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can(p_cap text, p_target uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_role   public.user_role;
  v_active boolean;
  v_ov     jsonb;
begin
  select role, is_active, perm_overrides
    into v_role, v_active, v_ov
    from public.users
   where id = coalesce(p_target, auth.uid());

  if not found or not v_active then
    return false;
  end if;

  if v_ov ? p_cap then
    return coalesce((v_ov ->> p_cap)::boolean, private.cap_role_default(p_cap, v_role));
  end if;

  return private.cap_role_default(p_cap, v_role);
end;
$$;


--
-- Name: FUNCTION can(p_cap text, p_target uuid); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.can(p_cap text, p_target uuid) IS 'Эффективное право пользователя: оверрайд (perm_overrides) > дефолт роли. Деактивированный/несуществующий → false. Источник правды для RLS. Используется в политиках вместо is_staff()/can_manage_users()/is_owner().';


--
-- Name: can_create_clients(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_create_clients() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.can('create_clients')
$$;


--
-- Name: FUNCTION can_create_clients(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.can_create_clients() IS 'Задача 1: кто вправе создавать клиентов — активные owner/admin/office_manager/lawyer. Експерт исключён (работает только по назначенным делам).';


--
-- Name: can_grant_cap(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_grant_cap(p_cap text, p_target uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION can_grant_cap(p_cap text, p_target uuid); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.can_grant_cap(p_cap text, p_target uuid) IS 'Кто вправе менять конкретное право у конкретного пользователя. Ступенчатые права + анти-эскалация: нет self-edit, edit_payroll_rates — только owner, manage_users — только owner/admin по роли, не-владелец не выдаёт чего не имеет.';


--
-- Name: can_manage_target_user(public.user_role); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_manage_target_user(target_role public.user_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when not private.can('manage_users') then false
    when private.is_owner() then true
    else target_role in ('office_manager', 'lawyer', 'expert')
  end
$$;


--
-- Name: FUNCTION can_manage_target_user(target_role public.user_role); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.can_manage_target_user(target_role public.user_role) IS 'Ступенчатые права на управление пользователем (cap-aware): нужен manage_users; owner-по-роли — любой; иной обладатель права — только office_manager/lawyer/expert. Защищает от повышения до owner/admin не-владельцем.';


--
-- Name: can_manage_user_salary(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_manage_user_salary(p_target uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when private.is_owner() then true
    when private.can_manage_users() then exists (
      select 1 from public.users u
       where u.id = p_target
         and u.id <> auth.uid()
         and u.department_id is not null
         and u.department_id = private.current_user_department()
         and u.role in ('office_manager', 'lawyer', 'expert')
    )
    else false
  end
$$;


--
-- Name: can_manage_users(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_manage_users() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select role in ('owner', 'admin')
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;


--
-- Name: can_see_all_cases(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_see_all_cases() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.is_owner()
      or (private.can('view_all_cases') and private.scope_is_all())
$$;


--
-- Name: can_see_case(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_see_case(p_case_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
      from public.cases c
     where c.id = p_case_id
       and private.case_visible(c.lawyer_id, c.responsible_id)
  )
$$;


--
-- Name: can_see_client(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_see_client(p_client_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    private.can_see_all_cases()
    or exists (
      select 1 from public.clients cl
       where cl.id = p_client_id
         and cl.created_by = private.active_uid()
    )
    or exists (
      select 1 from public.cases c
       where c.client_id = p_client_id
         and private.case_visible(c.lawyer_id, c.responsible_id)
    )
$$;


--
-- Name: can_write_case(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_write_case(p_case_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.can_see_case(p_case_id)
$$;


--
-- Name: cap_role_default(text, public.user_role); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cap_role_default(p_cap text, p_role public.user_role) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION cap_role_default(p_cap text, p_role public.user_role); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.cap_role_default(p_cap text, p_role public.user_role) IS 'Дефолт права по роли (источник истины для эффективного права, зеркалится в TS capRoleDefault). Должна совпадать с TS — проверяется CI parity-тестом.';


--
-- Name: case_acts_revert_on_payment_delete(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_acts_revert_on_payment_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_case_id uuid;
begin
  if old.act_id is not null then
    select case_id into v_case_id from public.case_acts where id = old.act_id;
    update public.case_acts
       set status           = 'issued',
           confirmed_amount = null,
           paid_at          = null,
           completion       = null,
           scan_document_id = null
     where id = old.act_id;
    if v_case_id is not null then
      perform private.recompute_case_act_completions(v_case_id);
    end if;
  end if;
  return old;
end;
$$;


--
-- Name: case_comments_guard_immutable(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_comments_guard_immutable() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.case_id <> old.case_id
     or new.author_id <> old.author_id
     or new.created_at <> old.created_at then
    raise exception 'case_comments: case_id/author_id/created_at неизменяемы';
  end if;
  return new;
end;
$$;


--
-- Name: case_dept_visible(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_dept_visible(p_lawyer uuid, p_responsible uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.can('view_all_cases')
     and exists (
       select 1
         from public.users u
        where u.id in (p_lawyer, p_responsible)
          and u.department_id is not null
          and u.department_id = private.current_user_department()
     )
$$;


--
-- Name: case_id_from_storage_path(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_id_from_storage_path(p_path text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare
  v_segment text;
  v_uuid uuid;
begin
  v_segment := split_part(p_path, '/', 2);
  if v_segment is null or length(v_segment) = 0 then
    return null;
  end if;
  begin
    v_uuid := v_segment::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v_uuid;
end;
$$;


--
-- Name: case_stage_order(public.case_stage); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_stage_order(s public.case_stage) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case s
    when 'new_request'::public.case_stage       then 1
    when 'consultation'::public.case_stage      then 2
    when 'in_progress'::public.case_stage       then 3
    when 'awaiting_decision'::public.case_stage then 4
    when 'closed'::public.case_stage            then 5
  end
$$;


--
-- Name: case_visible(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.case_visible(p_lawyer uuid, p_responsible uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    private.can_see_all_cases()
    or p_lawyer = private.active_uid()
    or p_responsible = private.active_uid()
    or (
      private.can('view_all_cases')
      and exists (
        select 1
          from public.users u
         where u.id in (p_lawyer, p_responsible)
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;


--
-- Name: cases_guard_archive(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_guard_archive() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    -- Новые дела архивными не создаются (stage по умолчанию new_request), но на
    -- всякий случай: archived_at при вставке → только staff и только у closed.
    if new.archived_at is not null then
      if not private.is_staff() then
        raise exception 'only staff may archive cases'
          using errcode = 'P0001', hint = 'archive_forbidden';
      end if;
      if new.stage <> 'closed' then
        raise exception 'only closed cases may be archived'
          using errcode = 'P0001', hint = 'archive_requires_closed';
      end if;
      new.archived_by := private.active_uid();
    else
      new.archived_by := null;
    end if;
    return new;
  end if;

  -- UPDATE: триггер навешен `of archived_at, archived_by`, т.е. срабатывает только
  -- когда эти колонки в SET. Реагируем лишь на фактическое изменение.
  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    if not private.is_staff() then
      raise exception 'only staff may archive cases'
        using errcode = 'P0001', hint = 'archive_forbidden';
    end if;
    if new.archived_at is not null then
      if new.stage <> 'closed' then
        raise exception 'only closed cases may be archived'
          using errcode = 'P0001', hint = 'archive_requires_closed';
      end if;
      new.archived_by := private.active_uid();
    else
      new.archived_by := null;
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: cases_guard_financial_fields(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_guard_financial_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.is_staff() then
    return new;
  end if;
  if new.category        is distinct from old.category
  or new.contract_sum    is distinct from old.contract_sum
  or new.lawyer_id       is distinct from old.lawyer_id
  or new.responsible_id  is distinct from old.responsible_id
  or new.client_id       is distinct from old.client_id then
    raise exception 'only staff can change financial fields of a case'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION cases_guard_financial_fields(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.cases_guard_financial_fields() IS 'v3 s1: только staff (is_staff) меняет ЗП-определяющие поля дела (category/contract_sum/lawyer_id/responsible_id/client_id). Аудит HIGH#1.';


--
-- Name: cases_guard_rate_overrides(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_guard_rate_overrides() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if (new.lawyer_rate_override is not null or new.expert_rate_override is not null)
       and not private.can('edit_rate_overrides') then
      raise exception 'only users with edit_rate_overrides may set per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.lawyer_rate_override is distinct from old.lawyer_rate_override
        or new.expert_rate_override is distinct from old.expert_rate_override)
       and not private.can('edit_rate_overrides') then
      raise exception 'only users with edit_rate_overrides may change per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: cases_recompute_acts_on_sum(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_recompute_acts_on_sum() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.contract_sum is distinct from old.contract_sum then
    perform private.recompute_case_act_completions(new.id);
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION cases_recompute_acts_on_sum(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.cases_recompute_acts_on_sum() IS 'v3 s1: смена contract_sum пересчитывает completion оплаченных актов дела (recompute_case_act_completions).';


--
-- Name: cases_recompute_debt(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_recompute_debt() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.debt     := greatest(new.contract_sum - coalesce(new.paid_total, 0), 0);
  new.overpaid := greatest(coalesce(new.paid_total, 0) - new.contract_sum, 0);
  return new;
end;
$$;


--
-- Name: cases_set_closed_without_act(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_set_closed_without_act() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.stage = 'closed' then
    new.closed_without_act := not exists (
      select 1 from public.documents
       where case_id = new.id and doc_type = 'act'
    );
  else
    new.closed_without_act := false;
  end if;
  return new;
end;
$$;


--
-- Name: cases_set_stage_changed_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_set_stage_changed_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: cases_validate_assignees(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_validate_assignees() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_active boolean;
begin
  -- lawyer_id
  select is_active into v_active from public.users where id = new.lawyer_id;
  if v_active is null then
    raise exception 'lawyer_id % does not exist in public.users', new.lawyer_id;
  end if;
  if not v_active then
    raise exception 'lawyer % is not active', new.lawyer_id
      using errcode = 'P0001', hint = 'lawyer_inactive';
  end if;

  -- responsible_id (Експерт)
  select is_active into v_active from public.users where id = new.responsible_id;
  if v_active is null then
    raise exception 'responsible_id % does not exist in public.users', new.responsible_id;
  end if;
  if not v_active then
    raise exception 'responsible (expert) % is not active', new.responsible_id
      using errcode = 'P0001', hint = 'responsible_inactive';
  end if;

  return new;
end;
$$;


--
-- Name: cases_validate_stage_forward(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cases_validate_stage_forward() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_from int := private.case_stage_order(old.stage);
  v_to   int := private.case_stage_order(new.stage);
begin
  -- v3 s7: «не заключили» — легитимный прыжок new_request|consultation → closed.
  -- Право и журнал (case_lost) выполнены в public.close_case_lost; формы UI поле
  -- outcome не отправляют, поэтому обычный «прыжок» в closed по-прежнему отсекается
  -- ветками ниже (new.outcome там NULL).
  if new.stage = 'closed' and new.outcome = 'lost' then
    return new;
  end if;

  -- no-op: UPDATE затронул stage, но значение не изменилось — тихо выходим.
  if new.stage = old.stage then
    return new;
  end if;

  if private.is_staff() then
    -- Staff: обычный шаг вперёд (+1) — штатное движение, без записи в журнал.
    -- Любая «коррекция» (прыжок вперёд через этап или откат назад) — логируем.
    if v_to <> v_from + 1 then
      insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
      values (
        'case',
        new.id,
        private.active_uid(),
        'stage_corrected',
        jsonb_build_object('from', old.stage::text, 'to', new.stage::text)
      );
    end if;
    return new;
  end if;

  -- Не-staff (lawyer/expert): только строго следующий этап.
  if v_to = v_from + 1 then
    return new; -- штатный шаг вперёд
  end if;

  if v_to < v_from then
    raise exception 'stage_backward_forbidden: cannot move case % from % to %',
      new.id, old.stage, new.stage
      using errcode = 'P0001';
  end if;

  -- v_to > v_from + 1 — прыжок через этап(ы).
  raise exception 'stage_skip_forbidden: cannot skip stages for case % (% -> %)',
    new.id, old.stage, new.stage
    using errcode = 'P0001';
end;
$$;


--
-- Name: FUNCTION cases_validate_stage_forward(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.cases_validate_stage_forward() IS 'Задача 8 + v3 s7: не-staff двигают этап только на +1 (откат → stage_backward_forbidden, прыжок → stage_skip_forbidden); staff может перескочить/откатить с записью stage_corrected. Исключение: closed+outcome=lost — легитимный lost-прыжок (через public.close_case_lost).';


--
-- Name: cash_guard_immutable_audit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cash_guard_immutable_audit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;


--
-- Name: cash_kind_for_method(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cash_kind_for_method(p_method text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case lower(coalesce(p_method, ''))
    when 'card' then 'card'
    when 'bank' then 'bank'
    when 'cash' then 'cash'
    when 'act'  then 'bank'
    else null
  end
$$;


--
-- Name: cash_resolve_account(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cash_resolve_account(p_method text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: cash_sync_on_payment(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.cash_sync_on_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: check_payout_allocations(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.check_payout_allocations() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tx_id  uuid;
  v_kind   text;
  v_amount numeric(14, 2);
  v_sum    numeric(14, 2);
begin
  -- transaction_id зависит от того, на какой таблице сработал триггер.
  if tg_table_name = 'payroll_transactions' then
    v_tx_id := coalesce(new.id, old.id);
  else
    v_tx_id := coalesce(new.transaction_id, old.transaction_id);
  end if;
  if v_tx_id is null then
    return null;
  end if;

  select kind, amount into v_kind, v_amount
    from public.payroll_transactions
   where id = v_tx_id;
  if not found then
    return null;             -- транзакция уже удалена (каскад аллокаций) — нечего сверять
  end if;
  if v_kind <> 'payout' then
    return null;             -- премии/удержания без распределения не трогаем
  end if;

  select coalesce(sum(amount), 0) into v_sum
    from public.payout_allocations
   where transaction_id = v_tx_id;

  if v_sum > v_amount then
    raise exception 'payout allocations (%) exceed transaction amount (%)', v_sum, v_amount
      using errcode = '23514';
  end if;

  return null;               -- AFTER-триггер: возвращаемое значение игнорируется
end;
$$;


--
-- Name: current_user_department(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_user_department() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select department_id
    from public.users
   where id = auth.uid() and is_active = true
$$;


--
-- Name: current_user_role(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select role from public.users where id = auth.uid() and is_active = true
$$;


--
-- Name: documents_sync_act_flag(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.documents_sync_act_flag() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_case uuid;
begin
  v_case := coalesce(new.case_id, old.case_id);
  if v_case is null then
    return null;
  end if;

  update public.cases c
     set closed_without_act = (
           c.stage = 'closed'
           and not exists (
             select 1 from public.documents d
              where d.case_id = c.id and d.doc_type = 'act'
           )
         )
   where c.id = v_case;

  return null;  -- AFTER-триггер
end;
$$;


--
-- Name: guard_perm_overrides_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_perm_overrides_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  k text;
begin
  if auth.uid() is null then
    return new;  -- системный путь (service_role): стражем выступает код
  end if;
  if new.perm_overrides is distinct from old.perm_overrides then
    for k in
      select jsonb_object_keys(
        coalesce(new.perm_overrides, '{}'::jsonb) || coalesce(old.perm_overrides, '{}'::jsonb)
      )
    loop
      if (new.perm_overrides -> k) is distinct from (old.perm_overrides -> k) then
        if not private.can_grant_cap(k, new.id) then
          raise exception 'not allowed to change capability % for this user', k
            using errcode = 'P0001', hint = 'perm_override_forbidden';
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;


--
-- Name: guard_user_salary_fields(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_user_salary_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    return new;  -- системный путь (service_role): стражем выступает код
  end if;

  if tg_op = 'INSERT' then
    if (new.salary_mode is distinct from 'percent' or new.salary_fixed_amount is not null)
       and not private.can_manage_user_salary(new.id) then
      raise exception 'only owner or department admin can set salary fields'
        using errcode = 'P0001', hint = 'salary_fields_forbidden';
    end if;
  elsif (new.salary_mode is distinct from old.salary_mode
         or new.salary_fixed_amount is distinct from old.salary_fixed_amount)
        and not private.can_manage_user_salary(new.id) then
    raise exception 'only owner or department admin can change salary fields'
      using errcode = 'P0001', hint = 'salary_fields_forbidden';
  end if;

  return new;
end;
$$;


--
-- Name: guard_user_visibility_fields(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_user_visibility_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    return new;  -- системный путь (service_role): стражем выступает код
  end if;

  if tg_op = 'INSERT' then
    -- Вставка не-owner'ом обязана оставлять дефолты (scope='department', без подразделения).
    if (new.visibility_scope is distinct from 'department' or new.department_id is not null)
       and not private.is_owner() then
      raise exception 'only owner can set visibility_scope/department_id'
        using errcode = 'P0001', hint = 'visibility_fields_owner_only';
    end if;
  elsif (new.visibility_scope is distinct from old.visibility_scope
         or new.department_id is distinct from old.department_id)
        and not private.is_owner() then
    raise exception 'only owner can change visibility_scope/department_id'
      using errcode = 'P0001', hint = 'visibility_fields_owner_only';
  end if;

  return new;
end;
$$;


--
-- Name: is_owner(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select role = 'owner'
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select role in ('owner', 'admin', 'office_manager')
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;


--
-- Name: payments_guard_act_payment(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.payments_guard_act_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if old.act_id is not null and (
       new.amount  is distinct from old.amount
    or new.paid_at is distinct from old.paid_at
    or new.case_id is distinct from old.case_id
    or new.act_id  is distinct from old.act_id
  ) then
    raise exception 'act-linked payment is immutable; delete it to revert the act'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION payments_guard_act_payment(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.payments_guard_act_payment() IS 'v3 s1: платёж с act_id неизменяем по amount/paid_at/case_id/act_id (правка рассинхронизировала бы акт/completion). method/note редактируемы.';


--
-- Name: payments_recalc_trigger(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.payments_recalc_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform private.recalc_case_totals(new.case_id);
  elsif tg_op = 'UPDATE' then
    if new.case_id is distinct from old.case_id then
      perform private.recalc_case_totals(old.case_id);
    end if;
    perform private.recalc_case_totals(new.case_id);
  elsif tg_op = 'DELETE' then
    perform private.recalc_case_totals(old.case_id);
  end if;
  return null;
end;
$$;


--
-- Name: payroll_see_all(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.payroll_see_all() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.is_owner()
      or (private.can('view_all_payroll') and private.scope_is_all())
$$;


--
-- Name: payroll_user_visible(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.payroll_user_visible(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    p_user_id = private.active_uid()
    or private.payroll_see_all()
    or (
      private.can('view_all_payroll')
      and exists (
        select 1 from public.users u
         where u.id = p_user_id
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;


--
-- Name: recalc_case_totals(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.recalc_case_totals(p_case_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_paid numeric(14, 2);
begin
  if p_case_id is null then
    return;
  end if;

  -- serialize concurrent payment recalcs per case (audit: lost update race)
  perform 1 from public.cases where id = p_case_id for update;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where case_id = p_case_id;

  -- Обновляем только paid_total — debt пересчитается BEFORE UPDATE триггером
  -- cases_recompute_debt (ниже).
  update public.cases
     set paid_total = v_paid
   where id = p_case_id;
end;
$$;


--
-- Name: recompute_case_act_completions(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.recompute_case_act_completions(p_case_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_contract numeric(14, 2);
  v_run      numeric(14, 2) := 0;
  rec        record;
begin
  select contract_sum into v_contract from public.cases where id = p_case_id;
  for rec in
    select id, confirmed_amount
      from public.case_acts
     where case_id = p_case_id and status = 'paid'
     order by paid_at asc, created_at asc, number asc
  loop
    v_run := v_run + coalesce(rec.confirmed_amount, 0);
    update public.case_acts
       set completion = case when v_run >= coalesce(v_contract, 0) then 'full' else 'partial' end
     where id = rec.id;
  end loop;
end;
$$;


--
-- Name: reset_perm_overrides_on_role_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reset_perm_overrides_on_role_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.role is distinct from old.role then
    new.perm_overrides := '{}'::jsonb;
  end if;
  return new;
end;
$$;


--
-- Name: scope_is_all(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.scope_is_all() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((
    select role in ('admin', 'office_manager')
       and (visibility_scope = 'all' or department_id is null)
      from public.users
     where id = auth.uid() and is_active = true
  ), false)
$$;


--
-- Name: sync_case_ledger(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_case_ledger(p_case_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_cat    public.case_category;
  v_paid   numeric(14, 2);
  v_stage  public.case_stage;
  v_mode   public.accrual_mode;
  v_lawyer uuid;
  v_expert uuid;
  v_lo     numeric(5, 2);
  v_eo     numeric(5, 2);
  v_lp     numeric(5, 2);
  v_ep     numeric(5, 2);
  v_actor  uuid;
begin
  select category, paid_total, stage, accrual_mode, lawyer_id, responsible_id,
         lawyer_rate_override, expert_rate_override
    into v_cat, v_paid, v_stage, v_mode, v_lawyer, v_expert, v_lo, v_eo
    from public.cases
   where id = p_case_id;
  if not found then
    return;
  end if;

  -- Задача 2: удаляем accrued-строки специалистов, которые больше НЕ являются
  -- текущими lawyer_id/responsible_id (например, после переназначения). paid
  -- (фактически выплаченное) — историческая правда, её не трогаем. Делаем это
  -- независимо от режима/этапа: осиротевший accrued не должен «висеть».
  delete from public.payroll_ledger
   where case_id = p_case_id
     and status = 'accrued'
     and (
       (role_in_case = 'lawyer' and user_id is distinct from v_lawyer)
       or (role_in_case = 'expert' and user_id is distinct from v_expert)
     );

  -- Начисляем, если режим per_payment ИЛИ дело завершено. ВАЖНО (Задача 1):
  -- closed-дело тоже проходит — чтобы доплата после закрытия дописалась.
  if not (v_mode = 'per_payment' or v_stage = 'closed') then
    return;
  end if;

  select lawyer_percent, expert_percent
    into v_lp, v_ep
    from public.payroll_rates
   where category = v_cat;

  v_actor := auth.uid();  -- кто инициировал (может быть NULL для системных операций)

  perform private.upsert_ledger_entry(
    p_case_id, v_lawyer, 'lawyer', v_paid, coalesce(v_lo, v_lp), v_actor);
  perform private.upsert_ledger_entry(
    p_case_id, v_expert, 'expert', v_paid, coalesce(v_eo, v_ep), v_actor);
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: upsert_ledger_entry(uuid, uuid, text, numeric, numeric, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.upsert_ledger_entry(p_case_id uuid, p_user_id uuid, p_role text, p_base numeric, p_percent numeric, p_actor uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_target numeric(14, 2);
  v_paid   numeric(14, 2);
  v_rem    numeric(14, 2);
  v_rows   integer;
begin
  v_target := round(p_base * p_percent / 100, 2);

  -- C1: сериализация с параллельной отметкой выплаты/откатом. FOR UPDATE на
  -- строки роли×дела заставляет дождаться их коммита и перечитать актуальный
  -- Σ(paid) — иначе под снапшотом READ COMMITTED можно прочитать устаревший
  -- paid=0 и вставить дубль-accrued на полный target (см. шапку миграции).
  -- Без status-фильтра: блокируем ВСЕ строки роли×дела (и accrued, и paid),
  -- чтобы поймать ту самую строку, которую отметка выплаты переводит в paid.
  perform 1
    from public.payroll_ledger
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
   for update;

  -- Сколько роли уже физически выплачено по этому делу (исторические paid).
  -- Читается ПОСЛЕ FOR UPDATE → видит свежий коммит параллельной выплаты.
  select coalesce(sum(amount), 0)
    into v_paid
    from public.payroll_ledger
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
     and status = 'paid';

  v_rem := v_target - v_paid;

  if v_rem > 0 then
    -- Обновляем единственную accrued-строку под актуальный остаток…
    update public.payroll_ledger
       set base_amount = p_base,
           percent     = p_percent,
           amount      = v_rem
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
    get diagnostics v_rows = row_count;

    -- …или создаём новую (первое начисление либо доплата после выплаты).
    if v_rows = 0 then
      insert into public.payroll_ledger
        (case_id, user_id, role_in_case, base_amount, percent, amount, created_by)
      values
        (p_case_id, p_user_id, p_role, p_base, p_percent, v_rem, p_actor);
    end if;
  else
    -- Остатка нет (всё выплачено или ставку понизили) — accrued не нужен.
    delete from public.payroll_ledger
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
  end if;
end;
$$;


--
-- Name: FUNCTION upsert_ledger_entry(p_case_id uuid, p_user_id uuid, p_role text, p_base numeric, p_percent numeric, p_actor uuid); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.upsert_ledger_entry(p_case_id uuid, p_user_id uuid, p_role text, p_base numeric, p_percent numeric, p_actor uuid) IS 'Приводит accrued-остаток роли×дела к target − Σ(paid). C1: FOR UPDATE на строки роли×дела сериализует пересчёт с параллельной отметкой выплаты/откатом (защита от задвоения paid+accrued под READ COMMITTED). Задача 1/P1.3.';


--
-- Name: validate_perm_overrides(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_perm_overrides() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: case_payroll(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.case_payroll(p_case_id uuid) RETURNS TABLE(category public.case_category, lawyer_percent numeric, lawyer_amount numeric, expert_percent numeric, expert_amount numeric, total numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    c.category,
    case when lu.salary_mode = 'fixed' then 0
         else coalesce(c.lawyer_rate_override, r.lawyer_percent) end as lawyer_percent,
    case when lu.salary_mode = 'fixed' then 0
         else round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2)
    end as lawyer_amount,
    case when eu.salary_mode = 'fixed' then 0
         else coalesce(c.expert_rate_override, r.expert_percent) end as expert_percent,
    case when eu.salary_mode = 'fixed' then 0
         else round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
    end as expert_amount,
    (case when lu.salary_mode = 'fixed' then 0
          else round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) end)
    + (case when eu.salary_mode = 'fixed' then 0
            else round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2) end)
      as total
  from public.cases c
  join public.payroll_rates r on r.category = c.category
  left join public.users lu on lu.id = c.lawyer_id
  left join public.users eu on eu.id = c.responsible_id
  where c.id = p_case_id
    and private.case_visible(c.lawyer_id, c.responsible_id);
$$;


--
-- Name: FUNCTION case_payroll(p_case_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.case_payroll(p_case_id uuid) IS 'Начисление % по делу (эффективная ставка = coalesce(override, ставка категории)). v2 Этап 4: у роли в режиме salary_mode=fixed процент и сумма = 0. SECURITY DEFINER + явный гейт private.case_visible.';


--
-- Name: cash_backfill_payments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cash_backfill_payments() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer := 0;
begin
  if not private.can('can_manage_cash') then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id, created_by)
  select acc.id,
         p.paid_at,
         'in',
         p.amount,
         left(coalesce(
           nullif(btrim(p.note), ''),
           'Оплата по справі' || coalesce(': ' || c.number_title, '')
         ), 300),
         p.case_id,
         p.id,
         p.created_by
  from public.payments p
  left join public.cases c on c.id = p.case_id
  cross join lateral (select private.cash_resolve_account(p.method) as id) acc
  where acc.id is not null
    and not exists (select 1 from public.cash_entries e where e.payment_id = p.id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


--
-- Name: FUNCTION cash_backfill_payments(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cash_backfill_payments() IS 'Заводит недостающие cash_entries для платежей без них (счёт/описание как у автоприхода). Идемпотентно. Право can_manage_cash. v3 s3.';


--
-- Name: cash_balances_before(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cash_balances_before(p_before date) RETURNS TABLE(account_id uuid, balance numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select e.account_id,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)
  from public.cash_entries e
  join public.cash_accounts a on a.id = e.account_id
  where e.entry_date < p_before
    and e.entry_date >= a.opening_date     -- операции до opening_date уже в opening_balance
    and private.can('can_manage_cash')     -- право проверяется внутри DEFINER
  group by e.account_id;
$$;


--
-- Name: FUNCTION cash_balances_before(p_before date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cash_balances_before(p_before date) IS 'Перенос остатка по счетам кассы строго до p_before (исключая операции раньше opening_date — они уже в opening_balance). Эффективный остаток на начало = cash_accounts.opening_balance + balance. Право can_manage_cash. v3 s3.';


--
-- Name: cash_unsynced_payments_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cash_unsynced_payments_count() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when private.can('can_manage_cash') then (
      select count(*)::int
      from public.payments p
      where not exists (select 1 from public.cash_entries e where e.payment_id = p.id)
    )
    else 0
  end;
$$;


--
-- Name: FUNCTION cash_unsynced_payments_count(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cash_unsynced_payments_count() IS 'Число платежей без связанной строки кассы (для баннера бэкфилла). Без права can_manage_cash возвращает 0. v3 s3.';


--
-- Name: close_case_lost(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_case_lost(p_case_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_case public.cases%rowtype;
begin
  select * into v_case from public.cases where id = p_case_id for update;
  if not found then
    raise exception 'case not found';
  end if;

  -- Права: staff ИЛИ юрист дела; и дело видимо зрителю (скоуп подразделения).
  if not (private.case_visible(v_case.lawyer_id, v_case.responsible_id)
          and (private.is_staff() or v_case.lawyer_id = private.active_uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Только до контракта: lost — это отказ ДО заключения договора.
  if v_case.stage not in ('new_request', 'consultation') then
    raise exception 'lost outcome is only for cases before the contract';
  end if;

  update public.cases
     set stage       = 'closed',
         closed_at   = (now() at time zone 'Europe/Kyiv')::date,
         outcome     = 'lost',
         lost_reason = nullif(btrim(p_reason), '')
   where id = p_case_id;

  perform public.log_activity(
    'case', p_case_id, 'case_lost',
    jsonb_build_object('reason', nullif(btrim(p_reason), ''))
  );
end;
$$;


--
-- Name: FUNCTION close_case_lost(p_case_id uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.close_case_lost(p_case_id uuid, p_reason text) IS 'v3 s7: закрывает дело как «не заключили» (stage→closed, outcome=lost, closed_at, lost_reason) с этапа new_request|consultation. Право: staff или юрист дела + видимость дела. Логирует case_lost. SECURITY DEFINER (проверка прав внутри).';


--
-- Name: confirm_act_paid(uuid, numeric, date, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_act_paid(p_act_id uuid, p_confirmed_amount numeric, p_paid_at date, p_storage_key text, p_file_name text, p_method text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid         uuid;
  v_case_id     uuid;
  v_lawyer      uuid;
  v_responsible uuid;   -- v3 s1: нужен для case_visible
  v_status      text;
  v_doc_id      uuid;
  v_payment_id  uuid;
begin
  v_uid := private.active_uid();
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- v3 s1: добираем responsible_id для проверки видимости дела.
  select a.case_id, a.status, c.lawyer_id, c.responsible_id
    into v_case_id, v_status, v_lawyer, v_responsible
    from public.case_acts a
    join public.cases c on c.id = a.case_id
   where a.id = p_act_id
   for update of a;

  if v_case_id is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;

  -- v3 s1: ранний лок строки дела — сериализация с recalc_case_totals и с
  -- параллельным подтверждением по этому же делу (анти-дедлок, единый порядок локов).
  perform 1 from public.cases where id = v_case_id for update;

  -- Право: (lawyer этого дела ИЛИ owner/admin по роли) И дело видимо зрителю.
  -- v3 s1: добавлен case_visible — admin чужого подразделения дело не подтвердит.
  if not ((private.can_manage_users() or v_lawyer = v_uid)
          and private.case_visible(v_lawyer, v_responsible)) then
    raise exception 'insufficient privilege to confirm act' using errcode = '42501';
  end if;

  if v_status <> 'issued' then
    raise exception 'act % is not in issued status', p_act_id using errcode = 'P0001';
  end if;

  if p_confirmed_amount is null or p_confirmed_amount <= 0 then
    raise exception 'confirmed amount must be positive' using errcode = '22023';
  end if;
  if p_paid_at is null then
    raise exception 'paid_at is required' using errcode = '22023';
  end if;
  if p_storage_key is null or p_file_name is null then
    raise exception 'scan is required' using errcode = '22023';
  end if;

  -- 1) Скан → documents (doc_type='act'); атомарно с платежом.
  insert into public.documents (case_id, file_name, storage_key, doc_type, uploaded_by)
  values (v_case_id, p_file_name, p_storage_key, 'act', v_uid)
  returning id into v_doc_id;

  -- 2) Платёж по делу (триггеры пересчитают paid_total/долг; ЗП растёт сама).
  insert into public.payments (case_id, amount, paid_at, method, note, created_by, act_id)
  values (v_case_id, p_confirmed_amount, p_paid_at, p_method, p_note, v_uid, p_act_id)
  returning id into v_payment_id;

  -- 3) Акт → paid (completion — временный placeholder, нормализуется ниже; CHECK
  --    требует not null при paid).
  update public.case_acts
     set status           = 'paid',
         confirmed_amount = p_confirmed_amount,
         paid_at          = p_paid_at,
         scan_document_id = v_doc_id,
         completion       = 'partial'
   where id = p_act_id;

  -- 4) Пересчёт completion всех оплаченных актов дела (включая текущий).
  perform private.recompute_case_act_completions(v_case_id);

  -- 5) Журнал (entity_type='case' → запись попадает в историю дела).
  perform public.log_activity(
    'case', v_case_id, 'act_paid',
    jsonb_build_object('act_id', p_act_id, 'payment_id', v_payment_id, 'amount', p_confirmed_amount)
  );

  return v_payment_id;
end;
$$;


--
-- Name: FUNCTION confirm_act_paid(p_act_id uuid, p_confirmed_amount numeric, p_paid_at date, p_storage_key text, p_file_name text, p_method text, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_act_paid(p_act_id uuid, p_confirmed_amount numeric, p_paid_at date, p_storage_key text, p_file_name text, p_method text, p_note text) IS 'Атомарно подтверждает оплату акта: проверка прав (lawyer дела / owner / admin по роли) И видимость дела (case_visible) → documents(скан) → payment(act_id) → акт paid → пересчёт completion дела → журнал. v2 Этап 5; v3 s1: скоуп + лок дела.';


--
-- Name: conflict_check(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conflict_check(p_name text DEFAULT NULL::text, p_inn text DEFAULT NULL::text, p_phone text DEFAULT NULL::text) RETURNS TABLE(kind text, label text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select q.kind, q.label from (
    -- 1) дубль клиента: ИНН / телефон / похожее имя
    select 'client'::text as kind,
           cl.name || coalesce(' · ІПН ' || cl.inn, '') as label
    from public.clients cl
    where private.active_uid() is not null
      and (
        (p_inn is not null and p_inn <> '' and cl.inn = p_inn)
        or (p_phone is not null and p_phone <> '' and cl.phone = p_phone)
        or (p_name is not null and char_length(p_name) >= 5 and cl.name ilike '%' || p_name || '%')
      )

    union all

    -- 2) имя совпадает с оппонентом существующего дела
    select 'opponent'::text as kind,
           'Оппонент в деле «' || c.number_title || '»' as label
    from public.cases c
    where private.active_uid() is not null
      and p_name is not null and char_length(p_name) >= 5
      and c.opponent is not null
      and c.opponent ilike '%' || p_name || '%'

    union all

    -- 3) имя совпадает с именем существующего клиента (оппонент = наш доверитель)
    select 'client'::text as kind,
           'Уже клиент: ' || cl.name as label
    from public.clients cl
    where private.active_uid() is not null
      and p_name is not null and char_length(p_name) >= 5
      and cl.name ilike '%' || p_name || '%'
  ) q
  limit 20;
$$;


--
-- Name: FUNCTION conflict_check(p_name text, p_inn text, p_phone text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.conflict_check(p_name text, p_inn text, p_phone text) IS 'v3 s7: конфликт-чек/дедуп (lite). По всей базе (SECURITY DEFINER): клиент по ИНН/телефону/имени, имя среди оппонентов дел, имя среди клиентов («Уже клиент»). Возвращает только (kind, label). НЕ блокирует — UI показывает предупреждение.';


--
-- Name: create_payout(uuid, text, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_payout(p_user_id uuid, p_comment text, p_occurred_on date, p_allocations jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tx_id uuid;
  v_total numeric(14, 2);
  v_actor uuid;
begin
  if not private.can_manage_users() then
    raise exception 'forbidden: only owner/admin can create payouts';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'no allocations provided';
  end if;

  -- v3 s2: каждая аллокация должна ссылаться на дело, где p_user_id состоит в
  -- указанной роли (lawyer_id / responsible_id). Иначе выплату можно было бы
  -- «повесить» на чужое дело.
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) x
    left join public.cases c on c.id = (x->>'case_id')::uuid
    where c.id is null
       or (x->>'role_in_case') not in ('lawyer', 'expert')
       or ((x->>'role_in_case') = 'lawyer' and c.lawyer_id      is distinct from p_user_id)
       or ((x->>'role_in_case') = 'expert' and c.responsible_id is distinct from p_user_id)
  ) then
    raise exception 'allocation references a case not assigned to this user in that role'
      using errcode = '42501';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_allocations) x;

  if v_total <= 0 then
    raise exception 'payout total must be positive';
  end if;

  v_actor := (select private.active_uid());

  insert into public.payroll_transactions
    (user_id, kind, amount, comment, occurred_on, created_by)
  values
    (p_user_id, 'payout', v_total, nullif(btrim(coalesce(p_comment, '')), ''),
     coalesce(p_occurred_on, current_date), v_actor)
  returning id into v_tx_id;

  insert into public.payout_allocations (transaction_id, case_id, role_in_case, amount)
  select v_tx_id,
         (x->>'case_id')::uuid,
         x->>'role_in_case',
         (x->>'amount')::numeric
    from jsonb_array_elements(p_allocations) x;

  return v_tx_id;
end;
$$;


--
-- Name: FUNCTION create_payout(p_user_id uuid, p_comment text, p_occurred_on date, p_allocations jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_payout(p_user_id uuid, p_comment text, p_occurred_on date, p_allocations jsonb) IS 'Атомарно создаёт выплату (payroll_transactions kind=payout) и её распределение по делам (payout_allocations). Сумма = Σ аллокаций. Только owner/admin. v3 s2: проверяет принадлежность каждого дела сотруднику в указанной роли.';


--
-- Name: dashboard_payment_months(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_payment_months(p_from date) RETURNS TABLE(month_start date, total numeric)
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select date_trunc('month', p.paid_at)::date as month_start,
         coalesce(sum(p.amount), 0)            as total
  from public.payments p
  where p.paid_at >= p_from
  group by 1
  order by 1;
$$;


--
-- Name: dashboard_sources(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_sources(p_from date, p_to date) RETURNS TABLE(source text, clients_count bigint, cases_count bigint, paid_total numeric)
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select coalesce(cl.source, 'other')::text,
         count(distinct cl.id),
         count(distinct c.id),
         coalesce(sum(c.paid_total), 0)
  from public.clients cl
  left join public.cases c on c.client_id = cl.id
       and c.opened_at >= p_from and c.opened_at < p_to
  where cl.created_at >= p_from and cl.created_at < p_to
  group by 1
  order by 4 desc;
$$;


--
-- Name: FUNCTION dashboard_sources(p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dashboard_sources(p_from date, p_to date) IS 'v3 s7: источники клиентов за период [p_from, p_to): source / клиентов / дел / оплачено. SECURITY INVOKER — RLS зрителя ограничивает выдачу (staff — всё, специалист — свои).';


--
-- Name: dashboard_stock_months(date, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_stock_months(p_from date, p_user_id uuid DEFAULT NULL::uuid, p_fixed uuid[] DEFAULT '{}'::uuid[]) RETURNS TABLE(month_start date, debt numeric, salary numeric, active_cases bigint)
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  with bounds as (
    select (p_from + make_interval(months => g - 1))::date as month_start,
           (p_from + make_interval(months => g))::date     as d
    from generate_series(1, 6) as g
  ),
  -- Эффективная ставка ЗП по делу для зрителя (зеркало salaryRate() из TS).
  case_rate as (
    select
      c.id,
      c.contract_sum,
      c.opened_at,
      c.closed_at,
      case
        when p_user_id is null then
          (case when c.lawyer_id = any(p_fixed) then 0
                else coalesce(c.lawyer_rate_override, r.lawyer_percent, 0) end)
          + (case when c.responsible_id = any(p_fixed) then 0
                  else coalesce(c.expert_rate_override, r.expert_percent, 0) end)
        when c.lawyer_id = p_user_id then
          (case when c.lawyer_id = any(p_fixed) then 0
                else coalesce(c.lawyer_rate_override, r.lawyer_percent, 0) end)
        when c.responsible_id = p_user_id then
          (case when c.responsible_id = any(p_fixed) then 0
                else coalesce(c.expert_rate_override, r.expert_percent, 0) end)
        else 0
      end as rate
    from public.cases c
    -- LEFT join: дело без ставки категории всё равно учитывается в долге/active
    -- (его rate→0 через coalesce). INNER join выкинул бы его — расхождение с TS,
    -- где долг и активность от ставки НЕ зависят.
    left join public.payroll_rates r on r.category = c.category
  )
  select
    b.month_start,
    coalesce((
      select sum(greatest(0, cr.contract_sum - coalesce((
               select sum(p.amount)
               from public.payments p
               where p.case_id = cr.id and p.paid_at < b.d
             ), 0)))
      from case_rate cr
      where cr.opened_at < b.d
    ), 0) as debt,
    coalesce((
      select sum(p.amount * cr.rate / 100)
      from public.payments p
      join case_rate cr on cr.id = p.case_id
      where p.paid_at < b.d
    ), 0) as salary,
    (
      select count(*)
      from case_rate cr
      where cr.opened_at < b.d
        and (cr.closed_at is null or cr.closed_at >= b.d)
    ) as active_cases
  from bounds b
  order by b.month_start;
$$;


--
-- Name: debt_aging(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debt_aging() RETURNS TABLE(case_id uuid, number_title text, debt numeric, last_paid_at date, opened_at date)
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select c.id, c.number_title, c.debt,
         (select max(p.paid_at) from public.payments p where p.case_id = c.id),
         c.opened_at
  from public.cases c
  where c.debt > 0
    and c.stage <> 'closed'
  limit 500;
$$;


--
-- Name: FUNCTION debt_aging(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.debt_aging() IS 'v3 s9: незакрытые дела с debt > 0 + дата последней оплаты (или открытия). Бакеты давности считаются в TS. SECURITY INVOKER: RLS зрителя ограничивает.';


--
-- Name: get_user_login_secret(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_login_secret(p_user_id uuid) RETURNS TABLE(password text, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: log_activity(text, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: FUNCTION log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb) IS 'Управление доступами: + user_password_reset/user_email_changed/user_invited/user_deleted (entity_type user, гейт can(manage_users)). Прежний allowlist сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';


--
-- Name: manage_user_salaries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_user_salaries() RETURNS TABLE(user_id uuid, salary_mode text, salary_fixed_amount numeric, can_edit boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.salary_mode, u.salary_fixed_amount, private.can_manage_user_salary(u.id)
    from public.users u
   where private.payroll_user_visible(u.id)
$$;


--
-- Name: notify_reissue_calendar_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_reissue_calendar_token() RETURNS uuid
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  insert into public.user_notify_channels (user_id, calendar_token)
  values (private.active_uid(), gen_random_uuid())
  on conflict (user_id) do update
    set calendar_token = gen_random_uuid(),
        updated_at = now()
  returning calendar_token;
$$;


--
-- Name: overdue_plan_items(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.overdue_plan_items(p_today date) RETURNS TABLE(case_id uuid, number_title text, due_date date, amount numeric, paid_total numeric, plan_before numeric)
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select c.id, c.number_title, i.due_date, i.amount, c.paid_total,
         (select coalesce(sum(x.amount), 0)
            from public.payment_plan_items x
           where x.case_id = c.id
             and (x.due_date < i.due_date
                  or (x.due_date = i.due_date and x.created_at <= i.created_at)))
  from public.payment_plan_items i
  join public.cases c on c.id = i.case_id
  where i.due_date < p_today
    and c.stage <> 'closed'
  order by i.due_date
  limit 200;
$$;


--
-- Name: FUNCTION overdue_plan_items(p_today date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.overdue_plan_items(p_today date) IS 'v3 s9: позиции графика с due_date < p_today по незакрытым делам + накопленный plan_before (сумма позиций до неё включительно) — TS решает, недооплачена ли. SECURITY INVOKER: RLS зрителя ограничивает (staff — всё, юрист/Експерт — свои).';


--
-- Name: payroll_by_specialist(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payroll_by_specialist() RETURNS TABLE(user_id uuid, full_name text, role_in_case text, case_count bigint, paid_base numeric, earned numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with attributed as (
    select
      c.lawyer_id                                       as uid,
      'lawyer'::text                                    as role_in_case,
      c.paid_total,
      coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
    from public.cases c
    join public.payroll_rates r on r.category = c.category
    union all
    select
      c.responsible_id,
      'expert'::text,
      c.paid_total,
      coalesce(c.expert_rate_override, r.expert_percent)
    from public.cases c
    join public.payroll_rates r on r.category = c.category
  )
  select
    a.uid                                                       as user_id,
    u.full_name,
    a.role_in_case,
    count(*)                                                    as case_count,
    coalesce(sum(a.paid_total), 0)                              as paid_base,
    -- v2 Этап 4: режим fixed → процентная часть 0 (оклад в этом отчёте не показываем).
    coalesce(sum(case when u.salary_mode = 'fixed' then 0
                      else round(a.paid_total * a.percent / 100, 2) end), 0) as earned
  from attributed a
  join public.users u on u.id = a.uid
  where private.payroll_user_visible(a.uid)
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;


--
-- Name: FUNCTION payroll_by_specialist(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.payroll_by_specialist() IS 'Сводка начислений по сотрудникам с эффективной per-role ставкой. SECURITY DEFINER + явный фильтр зрителя (Задача 1): не-staff видит только свой user_id, staff — всех. Закрывает протечку, которая была при опоре на RLS (видны обе атрибуции общего дела). Совпадает по видимости с payroll_payout_by_specialist.';


--
-- Name: payroll_employee_cases(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payroll_employee_cases(p_user_id uuid, p_month date DEFAULT NULL::date) RETURNS TABLE(case_id uuid, number_title text, stage public.case_stage, role_in_case text, paid_total numeric, percent numeric, earned numeric, paid numeric, outstanding numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with um as (
    select salary_mode from public.users where id = p_user_id
  ),
  month_pay as (
    select p.case_id, sum(p.amount) as paid_month
      from public.payments p
     where p_month is null
        or (p.paid_at >= p_month and p.paid_at < (p_month + interval '1 month'))
     group by p.case_id
  ),
  buckets as (
    select c.id as case_id, c.number_title, c.stage, 'lawyer'::text as role_in_case,
           case when p_month is null then c.paid_total else coalesce(mp.paid_month, 0) end as base,
           coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
     where c.lawyer_id = p_user_id
    union all
    select c.id, c.number_title, c.stage, 'expert'::text,
           case when p_month is null then c.paid_total else coalesce(mp.paid_month, 0) end,
           coalesce(c.expert_rate_override, r.expert_percent)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
     where c.responsible_id = p_user_id
  ),
  alloc as (
    select a.case_id, a.role_in_case, coalesce(sum(a.amount), 0) as paid
      from public.payout_allocations a
      join public.payroll_transactions t on t.id = a.transaction_id
     where t.user_id = p_user_id
       and (p_month is null
            or (t.occurred_on >= p_month and t.occurred_on < (p_month + interval '1 month')))
     group by a.case_id, a.role_in_case
  )
  select
    b.case_id,
    b.number_title,
    b.stage,
    b.role_in_case,
    b.base as paid_total,
    -- v2 Этап 4: режим fixed → процент и заработок по делу = 0.
    case when (select salary_mode from um) = 'fixed' then 0 else b.percent end as percent,
    case when (select salary_mode from um) = 'fixed' then 0
         else round(b.base * b.percent / 100, 2) end as earned,
    coalesce(al.paid, 0) as paid,
    (case when (select salary_mode from um) = 'fixed' then 0
          else round(b.base * b.percent / 100, 2) end) - coalesce(al.paid, 0) as outstanding
  from buckets b
  left join alloc al
    on al.case_id = b.case_id and al.role_in_case = b.role_in_case
  where private.payroll_user_visible(p_user_id)
  order by outstanding desc, b.number_title asc;
$$;


--
-- Name: FUNCTION payroll_employee_cases(p_user_id uuid, p_month date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.payroll_employee_cases(p_user_id uuid, p_month date) IS 'Разбивка ЗП сотрудника по делам за месяц (NULL = всё время). v2 Этап 4: режим salary_mode=fixed зануляет процент/заработок по делам. SECURITY DEFINER + фильтр payroll_user_visible.';


--
-- Name: payroll_employee_summary(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payroll_employee_summary(p_month date DEFAULT NULL::date) RETURNS TABLE(user_id uuid, full_name text, earned numeric, fixed numeric, bonus numeric, payout numeric, balance numeric, salary_mode text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with
  month_pay as (
    select p.case_id, sum(p.amount) as paid_month
      from public.payments p
     where p_month is null
        or (p.paid_at >= p_month and p.paid_at < (p_month + interval '1 month'))
     group by p.case_id
  ),
  -- Начислено % за месяц (база = оплачено за месяц); режим fixed → 0.
  assigned_month as (
    select c.lawyer_id as uid,
           case when lu.salary_mode = 'fixed' then 0
                else round(coalesce(mp.paid_month, 0) * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2)
           end as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join public.users lu on lu.id = c.lawyer_id
      left join month_pay mp on mp.case_id = c.id
    union all
    select c.responsible_id,
           case when eu.salary_mode = 'fixed' then 0
                else round(coalesce(mp.paid_month, 0) * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
           end
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join public.users eu on eu.id = c.responsible_id
      left join month_pay mp on mp.case_id = c.id
  ),
  earned_month as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_month group by uid
  ),
  -- Начислено % за всё время (база накопленного баланса); режим fixed → 0.
  assigned_all as (
    select c.lawyer_id as uid,
           case when lu.salary_mode = 'fixed' then 0
                else round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2)
           end as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join public.users lu on lu.id = c.lawyer_id
    union all
    select c.responsible_id,
           case when eu.salary_mode = 'fixed' then 0
                else round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
           end
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join public.users eu on eu.id = c.responsible_id
  ),
  earned_all as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_all group by uid
  ),
  tx_month as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     where p_month is null
        or (occurred_on >= p_month and occurred_on < (p_month + interval '1 month'))
     group by user_id
  ),
  tx_all as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     group by user_id
  )
  select
    u.id,
    u.full_name,
    coalesce(em.earned, 0) as earned,
    case when u.salary_mode in ('fixed', 'fixed_percent')
         then coalesce(u.salary_fixed_amount, 0) else 0 end as fixed,
    coalesce(tm.bonus, 0)  as bonus,
    coalesce(tm.payout, 0) as payout,
    coalesce(ea.earned, 0) + coalesce(ta.bonus, 0) - coalesce(ta.payout, 0) as balance,
    u.salary_mode
  from public.users u
  left join earned_month em on em.uid = u.id
  left join earned_all   ea on ea.uid = u.id
  left join tx_month     tm on tm.user_id = u.id
  left join tx_all       ta on ta.user_id = u.id
  -- v2 Этап 2: зритель видит свою строку + сотрудников в зоне видимости.
  where private.payroll_user_visible(u.id)
    -- причастные к ЗП за всё время ИЛИ на окладе (показываем и без дел/движений).
    and (ea.uid is not null or ta.user_id is not null or u.salary_mode <> 'percent')
  order by balance desc, u.full_name asc;
$$;


--
-- Name: FUNCTION payroll_employee_summary(p_month date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.payroll_employee_summary(p_month date) IS 'Сводка ЗП по сотрудникам. earned (% за месяц), fixed (оклад за месяц, справочно), bonus/payout за месяц, balance — накопленный остаток (% + премии − выплаты; оклад НЕ входит). v2 Этап 4: режим fixed зануляет %, на окладе сотрудник в списке даже без дел. SECURITY DEFINER + фильтр payroll_user_visible.';


--
-- Name: payroll_payout_by_specialist(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payroll_payout_by_specialist() RETURNS TABLE(user_id uuid, full_name text, role_in_case text, total numeric, paid numeric, outstanding numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    l.user_id,
    u.full_name,
    l.role_in_case,
    coalesce(sum(l.amount), 0)                                            as total,
    coalesce(sum(l.amount) filter (where l.status = 'paid'), 0)           as paid,
    coalesce(sum(l.amount) filter (where l.status = 'accrued'), 0)        as outstanding
  from public.payroll_ledger l
  join public.users u on u.id = l.user_id
  group by l.user_id, u.full_name, l.role_in_case
  order by outstanding desc, paid desc, u.full_name asc;
$$;


--
-- Name: FUNCTION payroll_payout_by_specialist(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.payroll_payout_by_specialist() IS 'Сводка по леджеру: начислено всего / выплачено / к выплате (остаток) по сотруднику×роли. SECURITY INVOKER → RLS payroll_ledger. Задача 5.';


--
-- Name: revert_payout(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_payout(p_ledger_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_case     uuid;
  v_user     uuid;
  v_role     text;
  v_amount   numeric(14, 2);
  v_status   text;
  v_existing uuid;
begin
  -- Права: откат — финансовая/деструктивная операция, только owner/admin.
  if not private.can_manage_users() then
    raise exception 'revert_payout: insufficient privileges'
      using errcode = '42501';
  end if;

  -- Снимок откатываемой строки + блокировка от гонок.
  select case_id, user_id, role_in_case, amount, status
    into v_case, v_user, v_role, v_amount, v_status
    from public.payroll_ledger
   where id = p_ledger_id
   for update;

  if not found then
    raise exception 'revert_payout: ledger row % not found', p_ledger_id
      using errcode = 'P0002';
  end if;

  if v_status <> 'paid' then
    raise exception 'revert_payout: row % is not paid (status=%)', p_ledger_id, v_status
      using errcode = 'P0001';
  end if;

  -- Уже есть accrued-остаток по этой роли×делу?
  select id
    into v_existing
    from public.payroll_ledger
   where case_id = v_case
     and user_id = v_user
     and role_in_case = v_role
     and status = 'accrued'
   for update;

  if v_existing is not null then
    -- Слияние: возвращаемую сумму прибавляем к существующему остатку, а исходную
    -- paid-строку удаляем — иначе получилось бы две accrued → нарушение индекса.
    update public.payroll_ledger
       set amount = amount + v_amount
     where id = v_existing;

    delete from public.payroll_ledger
     where id = p_ledger_id;
  else
    -- Остатка нет — переводим paid-строку обратно в accrued.
    update public.payroll_ledger
       set status  = 'accrued',
           paid_at = null,
           paid_by = null
     where id = p_ledger_id;
  end if;

  -- Приводим остаток к target − выплачено (надёжнее ручной арифметики; безопасно
  -- даже при изменившихся paid_total/ставке). Если режим/этап не велит начислять,
  -- sync — no-op, и корректный результат уже обеспечен слиянием выше.
  perform private.sync_case_ledger(v_case);
end;
$$;


--
-- Name: FUNCTION revert_payout(p_ledger_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.revert_payout(p_ledger_id uuid) IS 'Атомарный откат выплаты paid → accrued со слиянием в существующий остаток (защита от дублей accrued / нарушения payroll_ledger_one_accrued_idx). Права owner/admin (private.can_manage_users). Проблема 1.';


--
-- Name: search_case_ids(text, public.case_stage, public.case_type, uuid, public.case_category, uuid, uuid, uuid, boolean, date, date, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_case_ids(p_q text DEFAULT NULL::text, p_stage public.case_stage DEFAULT NULL::public.case_stage, p_case_type public.case_type DEFAULT NULL::public.case_type, p_responsible_id uuid DEFAULT NULL::uuid, p_category public.case_category DEFAULT NULL::public.case_category, p_lawyer_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_archived boolean DEFAULT NULL::boolean, p_closed_from date DEFAULT NULL::date, p_closed_to date DEFAULT NULL::date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort text DEFAULT 'opened_at'::text, p_dir text DEFAULT 'desc'::text) RETURNS TABLE(id uuid, total bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with normalized as (
    select
      case when p_q is null or length(trim(p_q)) = 0 then null
           else '%' || trim(p_q) || '%' end as pattern,
      greatest(0, least(coalesce(p_limit, 20), 100))::int as lim,
      greatest(0, coalesce(p_offset, 0))::int as off,
      lower(coalesce(p_sort, 'opened_at')) as sort_col,
      case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as sort_dir
  ),
  matching as (
    select c.id, c.number_title, c.opened_at, c.contract_sum, c.debt, c.created_at
    from public.cases c
    left join public.clients cl on cl.id = c.client_id
    cross join normalized n
    where (
      n.pattern is null
      or c.number_title ilike n.pattern
      or c.opponent ilike n.pattern
      or c.court_case_number ilike n.pattern
      or cl.name ilike n.pattern
      or exists (
        select 1
        from unnest(c.tags) as tag(value)
        where tag.value ilike n.pattern
      )
    )
    and (p_stage is null or c.stage = p_stage)
    and (p_case_type is null or c.case_type = p_case_type)
    and (p_responsible_id is null or c.responsible_id = p_responsible_id)
    and (p_category is null or c.category = p_category)
    and (p_lawyer_id is null or c.lawyer_id = p_lawyer_id)
    and (p_client_id is null or c.client_id = p_client_id)
    -- Подразделение: дело видно подразделению юриста ЛИБО эксперта.
    and (
      p_department_id is null
      or exists (
        select 1 from public.users u
        where u.id in (c.lawyer_id, c.responsible_id)
          and u.department_id = p_department_id
      )
    )
    -- Архив: p_archived true → только архивные; false → только активные; null → все.
    and (
      p_archived is null
      or (p_archived is true and c.archived_at is not null)
      or (p_archived is false and c.archived_at is null)
    )
    and (p_closed_from is null or c.closed_at >= p_closed_from)
    and (p_closed_to is null or c.closed_at <= p_closed_to)
  ),
  paged as (
    select
      m.id,
      count(*) over () as total
    from matching m
    cross join normalized n
    order by
      -- number_title
      case when n.sort_col = 'number_title' and n.sort_dir = 'asc'  then m.number_title end asc  nulls last,
      case when n.sort_col = 'number_title' and n.sort_dir = 'desc' then m.number_title end desc nulls last,
      -- contract_sum
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'asc'  then m.contract_sum end asc  nulls last,
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'desc' then m.contract_sum end desc nulls last,
      -- debt
      case when n.sort_col = 'debt'         and n.sort_dir = 'asc'  then m.debt end         asc  nulls last,
      case when n.sort_col = 'debt'         and n.sort_dir = 'desc' then m.debt end         desc nulls last,
      -- opened_at (default + fallback для неизвестных sort_col)
      case when (n.sort_col not in ('number_title','contract_sum','debt') or n.sort_col = 'opened_at')
                and n.sort_dir = 'asc'  then m.opened_at end asc  nulls last,
      case when (n.sort_col not in ('number_title','contract_sum','debt') or n.sort_col = 'opened_at')
                and n.sort_dir = 'desc' then m.opened_at end desc nulls last,
      m.created_at desc,
      m.id desc
    limit (select lim from normalized)
    offset (select off from normalized)
  )
  select p.id, p.total::bigint from paged p;
$$;


--
-- Name: FUNCTION search_case_ids(p_q text, p_stage public.case_stage, p_case_type public.case_type, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_case_ids(p_q text, p_stage public.case_stage, p_case_type public.case_type, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text) IS 'Поиск дел по number_title/opponent/court_case_number/client.name/tags. SECURITY INVOKER → RLS. Возвращает (case_id, total). Фильтры: p_stage/p_case_type/p_responsible_id/p_category/p_lawyer_id/p_client_id/p_department_id (юрист ИЛИ эксперт в подразделении) + p_archived + p_closed_from/p_closed_to. p_sort whitelist: number_title|opened_at|contract_sum|debt (default opened_at desc).';


--
-- Name: set_act_completion(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_act_completion(p_act_id uuid, p_completion text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_status      text;
  v_lawyer      uuid;   -- v3 s1: для case_visible
  v_responsible uuid;   -- v3 s1: для case_visible
begin
  -- v3 s1: добираем участников дела для проверки видимости.
  select a.status, c.lawyer_id, c.responsible_id
    into v_status, v_lawyer, v_responsible
    from public.case_acts a
    join public.cases c on c.id = a.case_id
   where a.id = p_act_id;
  if v_status is null then
    raise exception 'act % not found', p_act_id using errcode = 'P0002';
  end if;

  -- v3 s1: staff И дело видимо зрителю (скоуп подразделения).
  if not (private.is_staff() and private.case_visible(v_lawyer, v_responsible)) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;
  if p_completion not in ('full', 'partial') then
    raise exception 'invalid completion' using errcode = '22023';
  end if;
  if v_status <> 'paid' then
    raise exception 'completion applies to paid acts only' using errcode = 'P0001';
  end if;

  update public.case_acts set completion = p_completion where id = p_act_id;
end;
$$;


--
-- Name: FUNCTION set_act_completion(p_act_id uuid, p_completion text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_act_completion(p_act_id uuid, p_completion text) IS 'Ручное переопределение completion (full/partial) оплаченного акта. staff + видимость дела (case_visible). v2 Этап 5; v3 s1: скоуп подразделения.';


--
-- Name: set_my_language(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_language(lang text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if lang is null or lang not in ('uk', 'ru') then
    raise exception 'invalid language: %', lang using errcode = '22023';
  end if;

  update public.users
    set language = lang
    where id = auth.uid();
end;
$$;


--
-- Name: set_user_login_secret(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_login_secret(p_user_id uuid, p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: user_delete_blockers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_delete_blockers(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_crypto_key; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.app_crypto_key (
    id boolean DEFAULT true NOT NULL,
    key text NOT NULL,
    CONSTRAINT app_crypto_key_singleton CHECK (id)
);


--
-- Name: user_login_secrets; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.user_login_secrets (
    user_id uuid NOT NULL,
    secret bytea NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: TABLE user_login_secrets; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.user_login_secrets IS 'Зеркало последнего пароля, выданного владельцем через панель управления пользователями. Зашифровано pgcrypto (ключ — private.app_crypto_key). Читает ТОЛЬКО owner через public.get_user_login_secret. НЕ источник истины для входа (им остаётся auth.users) — может разойтись, если сотрудник сменил пароль сам.';


--
-- Name: absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text DEFAULT 'vacation'::text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT absences_kind_valid CHECK ((kind = ANY (ARRAY['vacation'::text, 'sick'::text, 'other'::text]))),
    CONSTRAINT absences_note_len CHECK (((note IS NULL) OR (char_length(note) <= 500))),
    CONSTRAINT absences_range_valid CHECK ((ends_on >= starts_on))
);


--
-- Name: TABLE absences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.absences IS 'Отпуска/отсутствия сотрудника: kind (vacation|sick|other), период starts_on…ends_on. Видимость по подразделению сотрудника (как дела). v2 Этап 6.';


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    changes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_log_action_check CHECK ((action = ANY (ARRAY['case_created'::text, 'case_updated'::text, 'case_deleted'::text, 'stage_corrected'::text, 'case_archived'::text, 'case_restored'::text, 'case_lost'::text, 'client_created'::text, 'client_updated'::text, 'client_deleted'::text, 'document_uploaded'::text, 'document_deleted'::text, 'payment_created'::text, 'payment_updated'::text, 'payment_deleted'::text, 'payment_plan_updated'::text, 'task_created'::text, 'task_updated'::text, 'task_toggled'::text, 'task_deleted'::text, 'payroll_paid'::text, 'payroll_reverted'::text, 'payroll_payout'::text, 'user_created'::text, 'user_role_changed'::text, 'user_deactivated'::text, 'user_reactivated'::text, 'user_permissions_changed'::text, 'user_department_changed'::text, 'user_salary_changed'::text, 'user_password_reset'::text, 'user_email_changed'::text, 'user_invited'::text, 'user_deleted'::text, 'comment_edited'::text, 'department_created'::text, 'department_renamed'::text, 'department_activated'::text, 'department_deactivated'::text, 'act_created'::text, 'act_paid'::text, 'act_deleted'::text])))
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: case_act_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_act_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_acts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_acts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    number integer DEFAULT nextval('public.case_act_number_seq'::regclass) NOT NULL,
    service_name text DEFAULT 'Юридичні послуги'::text NOT NULL,
    service_period text,
    amount numeric(14,2) NOT NULL,
    confirmed_amount numeric(14,2),
    completion text,
    status text DEFAULT 'issued'::text NOT NULL,
    issued_at date DEFAULT CURRENT_DATE NOT NULL,
    paid_at date,
    scan_document_id uuid,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT case_acts_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT case_acts_completion_valid CHECK (((completion IS NULL) OR (completion = ANY (ARRAY['full'::text, 'partial'::text])))),
    CONSTRAINT case_acts_confirmed_nonneg CHECK (((confirmed_amount IS NULL) OR (confirmed_amount >= (0)::numeric))),
    CONSTRAINT case_acts_status_consistency CHECK ((((status = 'issued'::text) AND (confirmed_amount IS NULL) AND (paid_at IS NULL) AND (completion IS NULL) AND (scan_document_id IS NULL)) OR ((status = 'paid'::text) AND (confirmed_amount IS NOT NULL) AND (paid_at IS NOT NULL) AND (completion IS NOT NULL)))),
    CONSTRAINT case_acts_status_valid CHECK ((status = ANY (ARRAY['issued'::text, 'paid'::text])))
);


--
-- Name: TABLE case_acts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.case_acts IS 'Рахунок-Акт (счёт-акт) по делу. issued → paid (скан + сумма → платёж). completion (full/partial) вычисляется при оплате накопительно по актам дела. v2 Этап 5.';


--
-- Name: case_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT case_comments_body_max CHECK ((length(body) <= 5000)),
    CONSTRAINT case_comments_body_not_blank CHECK ((length(btrim(body)) > 0))
);


--
-- Name: TABLE case_comments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.case_comments IS 'Комментарии (заметки) сотрудников к делу. Доступ наследуется от дела (RLS).';


--
-- Name: COLUMN case_comments.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.case_comments.updated_at IS 'Время последней правки тела комментария (NULL — не редактировался).';


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number_title text NOT NULL,
    client_id uuid NOT NULL,
    lawyer_id uuid NOT NULL,
    responsible_id uuid NOT NULL,
    opened_at date NOT NULL,
    case_type public.case_type NOT NULL,
    category public.case_category NOT NULL,
    subject text,
    stage public.case_stage DEFAULT 'new_request'::public.case_stage NOT NULL,
    priority public.case_priority DEFAULT 'normal'::public.case_priority NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    contract_sum numeric(14,2) DEFAULT 0 NOT NULL,
    paid_total numeric(14,2) DEFAULT 0 NOT NULL,
    debt numeric(14,2) DEFAULT 0 NOT NULL,
    billing_types public.billing_type[] DEFAULT '{}'::public.billing_type[] NOT NULL,
    opponent text,
    court_case_number text,
    court text,
    closed_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lawyer_rate_override numeric(5,2),
    expert_rate_override numeric(5,2),
    accrual_mode public.accrual_mode DEFAULT 'on_completion'::public.accrual_mode NOT NULL,
    overpaid numeric(14,2) DEFAULT 0 NOT NULL,
    closed_without_act boolean DEFAULT false NOT NULL,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text,
    lost_reason text,
    description text,
    CONSTRAINT cases_archived_requires_closed CHECK (((archived_at IS NULL) OR (stage = 'closed'::public.case_stage))),
    CONSTRAINT cases_closed_consistency CHECK (((stage = 'closed'::public.case_stage) = (closed_at IS NOT NULL))),
    CONSTRAINT cases_contract_sum_nonneg CHECK ((contract_sum >= (0)::numeric)),
    CONSTRAINT cases_debt_nonneg CHECK ((debt >= (0)::numeric)),
    CONSTRAINT cases_description_len CHECK (((description IS NULL) OR (char_length(description) <= 5000))),
    CONSTRAINT cases_expert_rate_override_check CHECK (((expert_rate_override >= (0)::numeric) AND (expert_rate_override <= (100)::numeric))),
    CONSTRAINT cases_lawyer_rate_override_check CHECK (((lawyer_rate_override >= (0)::numeric) AND (lawyer_rate_override <= (100)::numeric))),
    CONSTRAINT cases_lost_reason_check CHECK ((char_length(lost_reason) <= 500)),
    CONSTRAINT cases_outcome_check CHECK ((outcome = 'lost'::text)),
    CONSTRAINT cases_overpaid_nonneg CHECK ((overpaid >= (0)::numeric)),
    CONSTRAINT cases_paid_total_nonneg CHECK ((paid_total >= (0)::numeric))
);


--
-- Name: COLUMN cases.lawyer_rate_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.lawyer_rate_override IS 'Индивидуальный % юриста по этому делу. NULL → ставка категории (payroll_rates.lawyer_percent). Менять может только owner/admin.';


--
-- Name: COLUMN cases.expert_rate_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.expert_rate_override IS 'Индивидуальный % Експерта по этому делу. NULL → ставка категории (payroll_rates.expert_percent). Менять может только owner/admin.';


--
-- Name: COLUMN cases.accrual_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.accrual_mode IS 'Когда начисление зарплаты фиксируется в payroll_ledger: on_completion (при закрытии дела) или per_payment (по мере оплат). P2.1.';


--
-- Name: COLUMN cases.overpaid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.overpaid IS 'Дериватив: max(0, paid_total − contract_sum). Переплата клиента. Считается триггером cases_recompute_debt. Задача 3.';


--
-- Name: COLUMN cases.closed_without_act; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.closed_without_act IS 'true, если дело closed, но документа doc_type=act нет. Мягкая пометка (не блок). Сбрасывается при догрузке акта или выходе из closed. Задача 4.';


--
-- Name: COLUMN cases.stage_changed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.stage_changed_at IS 'Момент входа дела в текущий этап (stage). Обновляется триггером при смене stage. Для индикатора «N дней на этапе» (U6).';


--
-- Name: COLUMN cases.archived_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.archived_at IS 'Время отправки дела в архив (NULL — дело активно, в архиве не лежит).';


--
-- Name: COLUMN cases.archived_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.archived_by IS 'Кто отправил дело в архив (NULL — не в архиве). Проставляется триггером из active_uid().';


--
-- Name: COLUMN cases.outcome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.outcome IS 'Исход закрытого дела: NULL = завершено штатно (договор был); ''lost'' = не заключили договор (закрыто с этапа new_request|consultation через public.close_case_lost).';


--
-- Name: COLUMN cases.lost_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cases.lost_reason IS 'Свободный текст причины «не заключили» (≤500); заполняется в close_case_lost.';


--
-- Name: cash_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'bank'::text NOT NULL,
    opening_balance numeric(14,2) DEFAULT 0 NOT NULL,
    opening_date date DEFAULT CURRENT_DATE NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_accounts_kind_valid CHECK ((kind = ANY (ARRAY['card'::text, 'bank'::text, 'cash'::text])))
);


--
-- Name: TABLE cash_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_accounts IS 'Счета кассы (Карта/Рахунок/Готівка + добавляемые): kind, начальный остаток (opening_balance/opening_date), is_default — фолбэк автоприхода. Доступ private.can(can_manage_cash). v2 Этап 7.';


--
-- Name: cash_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    entry_date date NOT NULL,
    direction text NOT NULL,
    amount numeric(14,2) NOT NULL,
    description text NOT NULL,
    case_id uuid,
    payment_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_entries_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_entries_desc_len CHECK ((char_length(description) <= 300)),
    CONSTRAINT cash_entries_direction_valid CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
);


--
-- Name: TABLE cash_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_entries IS 'Операции кассы: direction in/out, amount, entry_date, свободное описание. Авто-строки (payment_id NOT NULL) создаёт триггер автоприхода и пользователю на UPDATE/DELETE не отдаются (только система). Доступ private.can(can_manage_cash). v2 Этап 7.';


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    client_kind public.client_kind NOT NULL,
    phone text,
    email text,
    address text,
    source public.client_source,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_name text,
    first_name text,
    middle_name text,
    birth_date date,
    inn text,
    contract_number text
);


--
-- Name: COLUMN clients.last_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.last_name IS 'Фамилия (физлицо/ФОП)';


--
-- Name: COLUMN clients.first_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.first_name IS 'Имя (физлицо/ФОП)';


--
-- Name: COLUMN clients.middle_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.middle_name IS 'Отчество (физлицо/ФОП)';


--
-- Name: COLUMN clients.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.birth_date IS 'Дата рождения';


--
-- Name: COLUMN clients.inn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.inn IS 'ИНН (ЕДРПОУ для ФОП/компаний), только цифры';


--
-- Name: COLUMN clients.contract_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.contract_number IS 'Номер договора (быстрый ввод; договор=дело — в cases)';


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.departments IS 'Подразделения (филиалы). С Этапа 2 v2 видимость admin/office_manager скоупится по ним.';


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    file_name text NOT NULL,
    storage_key text NOT NULL,
    doc_type public.doc_type DEFAULT 'other'::public.doc_type NOT NULL,
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN documents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents.updated_at IS 'Время последнего изменения файла (правка через OnlyOffice). Питает версионный ключ редактора.';


--
-- Name: org_requisites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_requisites (
    id smallint DEFAULT 1 NOT NULL,
    org_name text DEFAULT ''::text NOT NULL,
    edrpou text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    iban text DEFAULT ''::text NOT NULL,
    bank_name text DEFAULT ''::text NOT NULL,
    mfo text DEFAULT ''::text NOT NULL,
    tax_status_lines text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT org_requisites_singleton CHECK ((id = 1))
);


--
-- Name: TABLE org_requisites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_requisites IS 'Реквизиты компании-исполнителя (ВИКОНАВЕЦЬ) для печатной формы Рахунок-Акт. Single-row (id=1). Правит только owner, читают все активные сотрудники.';


--
-- Name: payment_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_plan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    due_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_plan_items_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_plan_items_note_check CHECK ((char_length(note) <= 300))
);


--
-- Name: TABLE payment_plan_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_plan_items IS 'v3 s9: график плановых доплат по делу (дата + сумма). Статус позиции (оплачено/ожидает/просрочено) считается на лету из cases.paid_total накопительно (lib/payments/plan.ts). Доступ наследуется от дела (can_see_case/can_write_case); UPDATE нет — правка через delete+insert.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    paid_at date NOT NULL,
    method text,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key uuid,
    act_id uuid,
    CONSTRAINT payments_amount_positive CHECK ((amount > (0)::numeric))
);


--
-- Name: COLUMN payments.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.idempotency_key IS 'Ключ идемпотентности отправки формы (Задача 2). Уникален среди не-NULL → повторная вставка того же платежа (мульти-сабмит) отвергается на уровне БД.';


--
-- Name: payout_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    case_id uuid NOT NULL,
    role_in_case text NOT NULL,
    amount numeric(14,2) NOT NULL,
    CONSTRAINT payout_allocations_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payout_allocations_role_in_case_check CHECK ((role_in_case = ANY (ARRAY['lawyer'::text, 'expert'::text])))
);


--
-- Name: TABLE payout_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payout_allocations IS 'Распределение выплаты (payroll_transactions kind=payout) по делам: какая часть выплаты закрывает заработок сотрудника по делу в роли lawyer|expert.';


--
-- Name: payroll_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_in_case text NOT NULL,
    base_amount numeric(14,2) NOT NULL,
    percent numeric(5,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    status text DEFAULT 'accrued'::text NOT NULL,
    accrued_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_by uuid,
    CONSTRAINT payroll_ledger_role_in_case_check CHECK ((role_in_case = ANY (ARRAY['lawyer'::text, 'expert'::text]))),
    CONSTRAINT payroll_ledger_status_check CHECK ((status = ANY (ARRAY['accrued'::text, 'paid'::text])))
);


--
-- Name: TABLE payroll_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payroll_ledger IS 'FROZEN 2026-06 (v3 s12): авто-синхронизация снята (триггер cases_sync_ledger удалён). Данные исторические; в текущем UI не отображается. Судьбу решит Phase 2.';


--
-- Name: COLUMN payroll_ledger.paid_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payroll_ledger.paid_by IS 'Кто (owner/admin) отметил строку выплаченной. NULL пока accrued или после отката. Задача 5.';


--
-- Name: payroll_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_rates (
    category public.case_category NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lawyer_percent numeric(5,2) NOT NULL,
    expert_percent numeric(5,2) NOT NULL,
    CONSTRAINT payroll_rates_expert_percent_check CHECK (((expert_percent >= (0)::numeric) AND (expert_percent <= (100)::numeric))),
    CONSTRAINT payroll_rates_lawyer_percent_check CHECK (((lawyer_percent >= (0)::numeric) AND (lawyer_percent <= (100)::numeric)))
);


--
-- Name: TABLE payroll_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payroll_rates IS 'Ставки % зарплаты по категории, РАЗДЕЛЬНО для юриста и Експерта (дефолты равны 7/10/25). База — cases.paid_total. Редактирует owner. Переопределяется на деле через cases.*_rate_override.';


--
-- Name: payroll_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    amount numeric(14,2) NOT NULL,
    comment text,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payroll_transactions_kind_check CHECK ((kind = ANY (ARRAY['payout'::text, 'bonus'::text])))
);


--
-- Name: TABLE payroll_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payroll_transactions IS 'Ручные движения зарплаты: payout (выплата, минус) и bonus (премия, плюс). Выплата распределяется по делам в payout_allocations. Не путать с payments (оплаты клиента) и payroll_ledger (старый, новым отчётом не используется).';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    kind public.task_kind DEFAULT 'task'::public.task_kind NOT NULL,
    assignee_id uuid NOT NULL,
    created_by uuid NOT NULL,
    due_at timestamp with time zone,
    status public.task_status DEFAULT 'open'::public.task_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_notify_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notify_channels (
    user_id uuid NOT NULL,
    telegram_chat_id text,
    telegram_link_code text,
    calendar_token uuid DEFAULT gen_random_uuid() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    perm_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    language text DEFAULT 'uk'::text NOT NULL,
    department_id uuid,
    "position" text,
    visibility_scope text DEFAULT 'department'::text NOT NULL,
    salary_mode text DEFAULT 'percent'::text NOT NULL,
    salary_fixed_amount numeric(14,2),
    CONSTRAINT users_language_check CHECK ((language = ANY (ARRAY['uk'::text, 'ru'::text]))),
    CONSTRAINT users_salary_amount_consistent CHECK ((((salary_mode = 'percent'::text) AND (salary_fixed_amount IS NULL)) OR ((salary_mode = ANY (ARRAY['fixed'::text, 'fixed_percent'::text])) AND (salary_fixed_amount IS NOT NULL)))),
    CONSTRAINT users_salary_fixed_nonneg CHECK (((salary_fixed_amount IS NULL) OR (salary_fixed_amount >= (0)::numeric))),
    CONSTRAINT users_salary_mode_check CHECK ((salary_mode = ANY (ARRAY['percent'::text, 'fixed'::text, 'fixed_percent'::text]))),
    CONSTRAINT users_visibility_scope_check CHECK ((visibility_scope = ANY (ARRAY['department'::text, 'all'::text])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Сотрудники компании. id зеркалит auth.users.id.';


--
-- Name: COLUMN users.perm_overrides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.perm_overrides IS 'Персональные права поверх роли (tri-state по ключу: true=разрешено, false=запрещено, нет ключа=наследует дефолт роли). Пусто {} = как у роли. Допустимые ключи валидируются триггером users_perm_overrides_1_validate.';


--
-- Name: COLUMN users.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.department_id IS 'Подразделение сотрудника. NULL — вне структуры; для admin/office_manager NULL = переходное «видит всё» (PLAN-V2).';


--
-- Name: COLUMN users."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."position" IS 'Отображаемая должность (свободный текст: керівник, заступник, юрист ВП, менеджер ВП, експерт, адміністратор). На права НЕ влияет — права задаёт role.';


--
-- Name: COLUMN users.visibility_scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.visibility_scope IS 'Для admin/office_manager: department — видит только своё подразделение, all — всю компанию. Выставляет только owner (БД-гард users_guard_visibility_fields). Для owner/lawyer/expert не действует.';


--
-- Name: COLUMN users.salary_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.salary_mode IS 'Режим зарплаты: percent (% от оплат, дефолт) | fixed (оклад, % зануляется) | fixed_percent (оклад + %). Меняет owner / admin своего подразделения (БД-гард users_guard_salary_fields).';


--
-- Name: COLUMN users.salary_fixed_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.salary_fixed_amount IS 'Фиксированный оклад в месяц (₴) для режимов fixed/fixed_percent; NULL для percent. В v1 показывается в отчёте справочно, в накопленный остаток ЗП не входит.';


--
-- Name: app_crypto_key app_crypto_key_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.app_crypto_key
    ADD CONSTRAINT app_crypto_key_pkey PRIMARY KEY (id);


--
-- Name: user_login_secrets user_login_secrets_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.user_login_secrets
    ADD CONSTRAINT user_login_secrets_pkey PRIMARY KEY (user_id);


--
-- Name: absences absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: case_acts case_acts_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_acts
    ADD CONSTRAINT case_acts_number_key UNIQUE (number);


--
-- Name: case_acts case_acts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_acts
    ADD CONSTRAINT case_acts_pkey PRIMARY KEY (id);


--
-- Name: case_comments case_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_pkey PRIMARY KEY (id);


--
-- Name: cases cases_closed_after_opened; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cases
    ADD CONSTRAINT cases_closed_after_opened CHECK (((closed_at IS NULL) OR (closed_at >= opened_at))) NOT VALID;


--
-- Name: cases cases_lost_requires_closed; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cases
    ADD CONSTRAINT cases_lost_requires_closed CHECK (((outcome IS NULL) OR (stage = 'closed'::public.case_stage))) NOT VALID;


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: cash_accounts cash_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_pkey PRIMARY KEY (id);


--
-- Name: cash_entries cash_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_pkey PRIMARY KEY (id);


--
-- Name: clients clients_inn_format; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.clients
    ADD CONSTRAINT clients_inn_format CHECK (((inn IS NULL) OR (inn ~ '^[0-9]{8,12}$'::text))) NOT VALID;


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: org_requisites org_requisites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_requisites
    ADD CONSTRAINT org_requisites_pkey PRIMARY KEY (id);


--
-- Name: payment_plan_items payment_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plan_items
    ADD CONSTRAINT payment_plan_items_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payout_allocations payout_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_allocations
    ADD CONSTRAINT payout_allocations_pkey PRIMARY KEY (id);


--
-- Name: payroll_ledger payroll_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ledger
    ADD CONSTRAINT payroll_ledger_pkey PRIMARY KEY (id);


--
-- Name: payroll_rates payroll_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_rates
    ADD CONSTRAINT payroll_rates_pkey PRIMARY KEY (category);


--
-- Name: payroll_transactions payroll_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_transactions
    ADD CONSTRAINT payroll_transactions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_notify_channels user_notify_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notify_channels
    ADD CONSTRAINT user_notify_channels_pkey PRIMARY KEY (user_id);


--
-- Name: user_notify_channels user_notify_channels_telegram_link_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notify_channels
    ADD CONSTRAINT user_notify_channels_telegram_link_code_key UNIQUE (telegram_link_code);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: absences_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absences_created_by_idx ON public.absences USING btree (created_by);


--
-- Name: absences_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absences_range_idx ON public.absences USING btree (starts_on, ends_on);


--
-- Name: absences_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absences_user_idx ON public.absences USING btree (user_id);


--
-- Name: activity_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_created_at_idx ON public.activity_log USING btree (created_at DESC);


--
-- Name: activity_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_entity_idx ON public.activity_log USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: activity_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_user_idx ON public.activity_log USING btree (user_id, created_at DESC);


--
-- Name: case_acts_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_acts_case_idx ON public.case_acts USING btree (case_id, created_at DESC);


--
-- Name: case_acts_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_acts_created_by_idx ON public.case_acts USING btree (created_by);


--
-- Name: case_acts_scan_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_acts_scan_document_id_idx ON public.case_acts USING btree (scan_document_id);


--
-- Name: case_acts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_acts_status_idx ON public.case_acts USING btree (status);


--
-- Name: case_comments_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX case_comments_case_idx ON public.case_comments USING btree (case_id, created_at DESC);


--
-- Name: cases_archive_closed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_archive_closed_at_idx ON public.cases USING btree (closed_at DESC) WHERE (archived_at IS NOT NULL);


--
-- Name: cases_archived_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_archived_at_idx ON public.cases USING btree (archived_at DESC) WHERE (archived_at IS NOT NULL);


--
-- Name: cases_archived_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_archived_by_idx ON public.cases USING btree (archived_by);


--
-- Name: cases_case_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_case_type_idx ON public.cases USING btree (case_type);


--
-- Name: cases_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_category_idx ON public.cases USING btree (category);


--
-- Name: cases_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_client_idx ON public.cases USING btree (client_id);


--
-- Name: cases_lawyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_lawyer_idx ON public.cases USING btree (lawyer_id);


--
-- Name: cases_opened_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_opened_at_idx ON public.cases USING btree (opened_at DESC);


--
-- Name: cases_responsible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_responsible_idx ON public.cases USING btree (responsible_id);


--
-- Name: cases_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cases_stage_idx ON public.cases USING btree (stage);


--
-- Name: cash_accounts_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_accounts_active_idx ON public.cash_accounts USING btree (is_active);


--
-- Name: cash_accounts_name_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_accounts_name_uniq ON public.cash_accounts USING btree (lower(name));


--
-- Name: cash_accounts_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_accounts_one_default ON public.cash_accounts USING btree (is_default) WHERE is_default;


--
-- Name: cash_entries_account_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_entries_account_date_idx ON public.cash_entries USING btree (account_id, entry_date);


--
-- Name: cash_entries_case_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_entries_case_id_idx ON public.cash_entries USING btree (case_id);


--
-- Name: cash_entries_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_entries_created_by_idx ON public.cash_entries USING btree (created_by);


--
-- Name: cash_entries_payment_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_entries_payment_uniq ON public.cash_entries USING btree (payment_id) WHERE (payment_id IS NOT NULL);


--
-- Name: clients_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_created_by_idx ON public.clients USING btree (created_by);


--
-- Name: clients_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_name_idx ON public.clients USING btree (name);


--
-- Name: documents_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_case_idx ON public.documents USING btree (case_id);


--
-- Name: documents_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_uploaded_by_idx ON public.documents USING btree (uploaded_by);


--
-- Name: payment_plan_items_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_plan_items_case_idx ON public.payment_plan_items USING btree (case_id, due_date);


--
-- Name: payments_act_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_act_id_uniq ON public.payments USING btree (act_id) WHERE (act_id IS NOT NULL);


--
-- Name: payments_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_case_idx ON public.payments USING btree (case_id);


--
-- Name: payments_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_created_by_idx ON public.payments USING btree (created_by);


--
-- Name: payments_idempotency_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_idempotency_key_idx ON public.payments USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: payments_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_paid_at_idx ON public.payments USING btree (paid_at DESC);


--
-- Name: payout_allocations_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payout_allocations_case_idx ON public.payout_allocations USING btree (case_id);


--
-- Name: payout_allocations_tx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payout_allocations_tx_idx ON public.payout_allocations USING btree (transaction_id);


--
-- Name: payout_allocations_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payout_allocations_uniq ON public.payout_allocations USING btree (transaction_id, case_id, role_in_case);


--
-- Name: payroll_ledger_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_ledger_case_idx ON public.payroll_ledger USING btree (case_id);


--
-- Name: payroll_ledger_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_ledger_created_by_idx ON public.payroll_ledger USING btree (created_by);


--
-- Name: payroll_ledger_one_accrued_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_ledger_one_accrued_idx ON public.payroll_ledger USING btree (case_id, user_id, role_in_case) WHERE (status = 'accrued'::text);


--
-- Name: payroll_ledger_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_ledger_status_idx ON public.payroll_ledger USING btree (status);


--
-- Name: payroll_ledger_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_ledger_user_idx ON public.payroll_ledger USING btree (user_id);


--
-- Name: payroll_transactions_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_transactions_created_by_idx ON public.payroll_transactions USING btree (created_by);


--
-- Name: payroll_transactions_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_transactions_kind_idx ON public.payroll_transactions USING btree (kind);


--
-- Name: payroll_transactions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_transactions_user_idx ON public.payroll_transactions USING btree (user_id);


--
-- Name: tasks_assignee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_assignee_idx ON public.tasks USING btree (assignee_id);


--
-- Name: tasks_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_case_idx ON public.tasks USING btree (case_id);


--
-- Name: tasks_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_created_by_idx ON public.tasks USING btree (created_by);


--
-- Name: tasks_due_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_due_open_idx ON public.tasks USING btree (due_at) WHERE (status = 'open'::public.task_status);


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: users_department_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_department_id_idx ON public.users USING btree (department_id);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: absences absences_no_overlap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER absences_no_overlap BEFORE INSERT ON public.absences FOR EACH ROW EXECUTE FUNCTION private.absences_no_overlap();


--
-- Name: payments case_acts_revert_on_payment_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER case_acts_revert_on_payment_delete BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.case_acts_revert_on_payment_delete();


--
-- Name: case_comments case_comments_guard_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER case_comments_guard_immutable BEFORE UPDATE ON public.case_comments FOR EACH ROW EXECUTE FUNCTION private.case_comments_guard_immutable();


--
-- Name: cases cases_guard_archive; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_guard_archive BEFORE INSERT OR UPDATE OF archived_at, archived_by ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_guard_archive();


--
-- Name: cases cases_guard_financial_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_guard_financial_fields BEFORE UPDATE OF category, contract_sum, lawyer_id, responsible_id, client_id ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_guard_financial_fields();


--
-- Name: cases cases_guard_rate_overrides; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_guard_rate_overrides BEFORE INSERT OR UPDATE OF lawyer_rate_override, expert_rate_override ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_guard_rate_overrides();


--
-- Name: cases cases_recompute_acts_on_sum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_recompute_acts_on_sum AFTER UPDATE OF contract_sum ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_recompute_acts_on_sum();


--
-- Name: cases cases_recompute_debt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_recompute_debt BEFORE INSERT OR UPDATE OF contract_sum, paid_total ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_recompute_debt();


--
-- Name: cases cases_set_closed_without_act; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_set_closed_without_act BEFORE INSERT OR UPDATE OF stage ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_set_closed_without_act();


--
-- Name: cases cases_set_stage_changed_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_set_stage_changed_at BEFORE UPDATE OF stage ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_set_stage_changed_at();


--
-- Name: cases cases_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_touch_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();


--
-- Name: cases cases_validate_assignees; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_validate_assignees BEFORE INSERT OR UPDATE OF lawyer_id, responsible_id ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_validate_assignees();


--
-- Name: cases cases_validate_stage_forward; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cases_validate_stage_forward BEFORE UPDATE OF stage ON public.cases FOR EACH ROW EXECUTE FUNCTION private.cases_validate_stage_forward();


--
-- Name: cash_accounts cash_accounts_guard_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_accounts_guard_audit BEFORE UPDATE ON public.cash_accounts FOR EACH ROW EXECUTE FUNCTION private.cash_guard_immutable_audit();


--
-- Name: cash_entries cash_entries_guard_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_entries_guard_audit BEFORE UPDATE ON public.cash_entries FOR EACH ROW EXECUTE FUNCTION private.cash_guard_immutable_audit();


--
-- Name: payments cash_sync_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cash_sync_on_payment AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.cash_sync_on_payment();


--
-- Name: payout_allocations check_payout_allocations_alloc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER check_payout_allocations_alloc AFTER INSERT OR DELETE OR UPDATE ON public.payout_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_payout_allocations();


--
-- Name: payroll_transactions check_payout_allocations_tx; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER check_payout_allocations_tx AFTER UPDATE OF amount ON public.payroll_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.check_payout_allocations();


--
-- Name: documents documents_sync_act_flag; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_sync_act_flag AFTER INSERT OR DELETE OR UPDATE OF doc_type ON public.documents FOR EACH ROW EXECUTE FUNCTION private.documents_sync_act_flag();


--
-- Name: payments payments_guard_act_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_guard_act_payment BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.payments_guard_act_payment();


--
-- Name: payments payments_recalc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_recalc AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.payments_recalc_trigger();


--
-- Name: users users_guard_salary_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_guard_salary_fields BEFORE INSERT OR UPDATE OF salary_mode, salary_fixed_amount ON public.users FOR EACH ROW EXECUTE FUNCTION private.guard_user_salary_fields();


--
-- Name: users users_guard_visibility_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_guard_visibility_fields BEFORE INSERT OR UPDATE OF visibility_scope, department_id ON public.users FOR EACH ROW EXECUTE FUNCTION private.guard_user_visibility_fields();


--
-- Name: users users_perm_overrides_1_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_perm_overrides_1_validate BEFORE INSERT OR UPDATE OF perm_overrides ON public.users FOR EACH ROW EXECUTE FUNCTION private.validate_perm_overrides();


--
-- Name: users users_perm_overrides_2_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_perm_overrides_2_guard BEFORE UPDATE OF perm_overrides ON public.users FOR EACH ROW EXECUTE FUNCTION private.guard_perm_overrides_change();


--
-- Name: users users_role_reset_perms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_role_reset_perms BEFORE UPDATE OF role ON public.users FOR EACH ROW EXECUTE FUNCTION private.reset_perm_overrides_on_role_change();


--
-- Name: user_login_secrets user_login_secrets_updated_by_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.user_login_secrets
    ADD CONSTRAINT user_login_secrets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_login_secrets user_login_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.user_login_secrets
    ADD CONSTRAINT user_login_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: absences absences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: absences absences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: case_acts case_acts_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_acts
    ADD CONSTRAINT case_acts_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;


--
-- Name: case_acts case_acts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_acts
    ADD CONSTRAINT case_acts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: case_acts case_acts_scan_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_acts
    ADD CONSTRAINT case_acts_scan_document_id_fkey FOREIGN KEY (scan_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: case_comments case_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: case_comments case_comments_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: cases cases_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cases cases_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;


--
-- Name: cases cases_lawyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_lawyer_id_fkey FOREIGN KEY (lawyer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cases cases_responsible_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cash_accounts cash_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cash_entries cash_entries_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.cash_accounts(id) ON DELETE RESTRICT;


--
-- Name: cash_entries cash_entries_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: cash_entries cash_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: cash_entries cash_entries_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: clients clients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: documents documents_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: org_requisites org_requisites_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_requisites
    ADD CONSTRAINT org_requisites_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payment_plan_items payment_plan_items_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plan_items
    ADD CONSTRAINT payment_plan_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: payment_plan_items payment_plan_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plan_items
    ADD CONSTRAINT payment_plan_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payments payments_act_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_act_id_fkey FOREIGN KEY (act_id) REFERENCES public.case_acts(id) ON DELETE SET NULL;


--
-- Name: payments payments_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payout_allocations payout_allocations_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_allocations
    ADD CONSTRAINT payout_allocations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;


--
-- Name: payout_allocations payout_allocations_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_allocations
    ADD CONSTRAINT payout_allocations_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.payroll_transactions(id) ON DELETE CASCADE;


--
-- Name: payroll_ledger payroll_ledger_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ledger
    ADD CONSTRAINT payroll_ledger_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;


--
-- Name: payroll_ledger payroll_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ledger
    ADD CONSTRAINT payroll_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payroll_ledger payroll_ledger_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ledger
    ADD CONSTRAINT payroll_ledger_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payroll_ledger payroll_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ledger
    ADD CONSTRAINT payroll_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payroll_transactions payroll_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_transactions
    ADD CONSTRAINT payroll_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payroll_transactions payroll_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_transactions
    ADD CONSTRAINT payroll_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tasks tasks_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_notify_channels user_notify_channels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notify_channels
    ADD CONSTRAINT user_notify_channels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

--
-- Name: absences absences_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_delete ON public.absences FOR DELETE TO authenticated USING ((private.absence_can_write(user_id) OR (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: absences absences_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_insert ON public.absences FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT private.active_uid() AS active_uid)) AND private.absence_can_write(user_id)));


--
-- Name: absences absences_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_select ON public.absences FOR SELECT TO authenticated USING (private.absence_user_visible(user_id));


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log activity_log_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_select_visible ON public.activity_log FOR SELECT TO authenticated USING ((private.can_see_all_cases() OR ((entity_type = 'case'::text) AND private.can_see_case(entity_id)) OR ((entity_type = 'client'::text) AND private.can_see_client(entity_id)) OR ((entity_type = 'user'::text) AND private.can('manage_users'::text))));


--
-- Name: case_acts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_acts ENABLE ROW LEVEL SECURITY;

--
-- Name: case_acts case_acts_delete_issued; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_acts_delete_issued ON public.case_acts FOR DELETE TO authenticated USING (((status = 'issued'::text) AND (private.can_manage_users() OR (created_by = ( SELECT private.active_uid() AS active_uid)))));


--
-- Name: case_acts case_acts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_acts_insert ON public.case_acts FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT private.active_uid() AS active_uid)) AND (EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.id = case_acts.case_id) AND private.case_visible(c.lawyer_id, c.responsible_id) AND (private.is_staff() OR (c.responsible_id = ( SELECT private.active_uid() AS active_uid))))))));


--
-- Name: case_acts case_acts_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_acts_select_via_case ON public.case_acts FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: case_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: case_comments case_comments_delete_author_or_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_comments_delete_author_or_managers ON public.case_comments FOR DELETE TO authenticated USING (((author_id = ( SELECT private.active_uid() AS active_uid)) OR private.can_manage_users()));


--
-- Name: case_comments case_comments_insert_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_comments_insert_via_case ON public.case_comments FOR INSERT TO authenticated WITH CHECK ((private.can_write_case(case_id) AND (author_id = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: case_comments case_comments_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_comments_select_via_case ON public.case_comments FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: case_comments case_comments_update_author_or_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY case_comments_update_author_or_managers ON public.case_comments FOR UPDATE TO authenticated USING (((author_id = ( SELECT private.active_uid() AS active_uid)) OR private.can_manage_users())) WITH CHECK (((author_id = ( SELECT private.active_uid() AS active_uid)) OR private.can_manage_users()));


--
-- Name: cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

--
-- Name: cases cases_delete_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_delete_managers ON public.cases FOR DELETE TO authenticated USING (private.can('delete_cases'::text));


--
-- Name: cases cases_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_insert_staff ON public.cases FOR INSERT TO authenticated WITH CHECK (private.can('create_cases'::text));


--
-- Name: cases cases_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_select_visible ON public.cases FOR SELECT TO authenticated USING ((( SELECT private.can_see_all_cases() AS can_see_all_cases) OR (lawyer_id = ( SELECT private.active_uid() AS active_uid)) OR (responsible_id = ( SELECT private.active_uid() AS active_uid)) OR private.case_dept_visible(lawyer_id, responsible_id)));


--
-- Name: cases cases_update_staff_or_assignee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cases_update_staff_or_assignee ON public.cases FOR UPDATE TO authenticated USING ((( SELECT private.can_see_all_cases() AS can_see_all_cases) OR (lawyer_id = ( SELECT private.active_uid() AS active_uid)) OR (responsible_id = ( SELECT private.active_uid() AS active_uid)) OR private.case_dept_visible(lawyer_id, responsible_id))) WITH CHECK ((( SELECT private.can_see_all_cases() AS can_see_all_cases) OR (lawyer_id = ( SELECT private.active_uid() AS active_uid)) OR (responsible_id = ( SELECT private.active_uid() AS active_uid)) OR private.case_dept_visible(lawyer_id, responsible_id)));


--
-- Name: cash_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_accounts cash_accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_accounts_delete ON public.cash_accounts FOR DELETE TO authenticated USING (private.can('can_manage_cash'::text));


--
-- Name: cash_accounts cash_accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_accounts_insert ON public.cash_accounts FOR INSERT TO authenticated WITH CHECK ((private.can('can_manage_cash'::text) AND (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: cash_accounts cash_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_accounts_select ON public.cash_accounts FOR SELECT TO authenticated USING (private.can('can_manage_cash'::text));


--
-- Name: cash_accounts cash_accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_accounts_update ON public.cash_accounts FOR UPDATE TO authenticated USING (private.can('can_manage_cash'::text)) WITH CHECK (private.can('can_manage_cash'::text));


--
-- Name: cash_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_entries cash_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_delete ON public.cash_entries FOR DELETE TO authenticated USING ((private.can('can_manage_cash'::text) AND (payment_id IS NULL)));


--
-- Name: cash_entries cash_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_insert ON public.cash_entries FOR INSERT TO authenticated WITH CHECK ((private.can('can_manage_cash'::text) AND (created_by = ( SELECT private.active_uid() AS active_uid)) AND (payment_id IS NULL)));


--
-- Name: cash_entries cash_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_select ON public.cash_entries FOR SELECT TO authenticated USING (private.can('can_manage_cash'::text));


--
-- Name: cash_entries cash_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_update ON public.cash_entries FOR UPDATE TO authenticated USING ((private.can('can_manage_cash'::text) AND (payment_id IS NULL))) WITH CHECK ((private.can('can_manage_cash'::text) AND (payment_id IS NULL)));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_delete_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_delete_managers ON public.clients FOR DELETE TO authenticated USING (private.can('delete_clients'::text));


--
-- Name: clients clients_insert_creators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_insert_creators ON public.clients FOR INSERT TO authenticated WITH CHECK ((private.can('create_clients'::text) AND (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: clients clients_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_select_visible ON public.clients FOR SELECT TO authenticated USING ((private.can_see_all_cases() OR (created_by = ( SELECT private.active_uid() AS active_uid)) OR (EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.client_id = clients.id) AND private.case_visible(c.lawyer_id, c.responsible_id))))));


--
-- Name: clients clients_update_staff_or_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_update_staff_or_creator ON public.clients FOR UPDATE TO authenticated USING ((private.can_see_all_cases() OR (created_by = ( SELECT private.active_uid() AS active_uid)) OR (private.can('view_all_cases'::text) AND (EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.client_id = clients.id) AND private.case_visible(c.lawyer_id, c.responsible_id))))))) WITH CHECK ((private.can_see_all_cases() OR (created_by = ( SELECT private.active_uid() AS active_uid)) OR (private.can('view_all_cases'::text) AND (EXISTS ( SELECT 1
   FROM public.cases c
  WHERE ((c.client_id = clients.id) AND private.case_visible(c.lawyer_id, c.responsible_id)))))));


--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_select_active ON public.departments FOR SELECT TO authenticated USING ((( SELECT private.active_uid() AS active_uid) IS NOT NULL));


--
-- Name: departments departments_write_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_write_owner ON public.departments TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_delete_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_delete_managers ON public.documents FOR DELETE TO authenticated USING ((private.can('delete_documents'::text) AND private.can_see_case(case_id)));


--
-- Name: documents documents_insert_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_insert_via_case ON public.documents FOR INSERT TO authenticated WITH CHECK ((private.can_write_case(case_id) AND (uploaded_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: documents documents_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_select_via_case ON public.documents FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: documents documents_update_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_update_via_case ON public.documents FOR UPDATE TO authenticated USING (private.can_write_case(case_id)) WITH CHECK (private.can_write_case(case_id));


--
-- Name: user_notify_channels notify_channels_self_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notify_channels_self_delete ON public.user_notify_channels FOR DELETE USING ((user_id = private.active_uid()));


--
-- Name: user_notify_channels notify_channels_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notify_channels_self_insert ON public.user_notify_channels FOR INSERT WITH CHECK ((user_id = private.active_uid()));


--
-- Name: user_notify_channels notify_channels_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notify_channels_self_select ON public.user_notify_channels FOR SELECT USING ((user_id = private.active_uid()));


--
-- Name: user_notify_channels notify_channels_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notify_channels_self_update ON public.user_notify_channels FOR UPDATE USING ((user_id = private.active_uid()));


--
-- Name: org_requisites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_requisites ENABLE ROW LEVEL SECURITY;

--
-- Name: org_requisites org_requisites_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_requisites_select ON public.org_requisites FOR SELECT TO authenticated USING ((( SELECT private.active_uid() AS active_uid) IS NOT NULL));


--
-- Name: org_requisites org_requisites_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_requisites_update_owner ON public.org_requisites FOR UPDATE TO authenticated USING (private.is_owner()) WITH CHECK (private.is_owner());


--
-- Name: payment_plan_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_plan_items ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_delete_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_delete_managers ON public.payments FOR DELETE TO authenticated USING (private.can('edit_payments'::text));


--
-- Name: payments payments_insert_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_insert_via_case ON public.payments FOR INSERT TO authenticated WITH CHECK ((private.can_write_case(case_id) AND (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: payments payments_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_select_via_case ON public.payments FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: payments payments_update_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_update_managers ON public.payments FOR UPDATE TO authenticated USING (private.can('edit_payments'::text)) WITH CHECK (private.can('edit_payments'::text));


--
-- Name: payout_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payout_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: payout_allocations payout_allocations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payout_allocations_select ON public.payout_allocations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.payroll_transactions t
  WHERE ((t.id = payout_allocations.transaction_id) AND private.payroll_user_visible(t.user_id)))));


--
-- Name: payout_allocations payout_allocations_write_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payout_allocations_write_managers ON public.payout_allocations TO authenticated USING (private.can_manage_users()) WITH CHECK (private.can_manage_users());


--
-- Name: payroll_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_ledger payroll_ledger_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_ledger_select_own ON public.payroll_ledger FOR SELECT TO authenticated USING ((user_id = ( SELECT private.active_uid() AS active_uid)));


--
-- Name: payroll_ledger payroll_ledger_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_ledger_select_staff ON public.payroll_ledger FOR SELECT TO authenticated USING (private.payroll_user_visible(user_id));


--
-- Name: payroll_ledger payroll_ledger_update_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_ledger_update_managers ON public.payroll_ledger FOR UPDATE TO authenticated USING (private.can_manage_users()) WITH CHECK (private.can_manage_users());


--
-- Name: payroll_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_rates payroll_rates_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_rates_insert_owner ON public.payroll_rates FOR INSERT TO authenticated WITH CHECK (private.can('edit_payroll_rates'::text));


--
-- Name: payroll_rates payroll_rates_select_assignees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_rates_select_assignees ON public.payroll_rates FOR SELECT TO authenticated USING ((( SELECT private.active_uid() AS active_uid) IS NOT NULL));


--
-- Name: payroll_rates payroll_rates_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_rates_select_staff ON public.payroll_rates FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: payroll_rates payroll_rates_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_rates_update_owner ON public.payroll_rates FOR UPDATE TO authenticated USING (private.can('edit_payroll_rates'::text)) WITH CHECK (private.can('edit_payroll_rates'::text));


--
-- Name: payroll_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_transactions payroll_transactions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_transactions_select_own ON public.payroll_transactions FOR SELECT TO authenticated USING ((user_id = ( SELECT private.active_uid() AS active_uid)));


--
-- Name: payroll_transactions payroll_transactions_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_transactions_select_staff ON public.payroll_transactions FOR SELECT TO authenticated USING (private.payroll_user_visible(user_id));


--
-- Name: payroll_transactions payroll_transactions_write_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_transactions_write_managers ON public.payroll_transactions TO authenticated USING (private.can_manage_users()) WITH CHECK (private.can_manage_users());


--
-- Name: payment_plan_items plan_delete_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_delete_via_case ON public.payment_plan_items FOR DELETE TO authenticated USING (private.can_write_case(case_id));


--
-- Name: payment_plan_items plan_insert_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_insert_via_case ON public.payment_plan_items FOR INSERT TO authenticated WITH CHECK ((private.can_write_case(case_id) AND (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: payment_plan_items plan_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_select_via_case ON public.payment_plan_items FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_delete_via_case ON public.tasks FOR DELETE TO authenticated USING (private.can_write_case(case_id));


--
-- Name: tasks tasks_insert_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_insert_via_case ON public.tasks FOR INSERT TO authenticated WITH CHECK ((private.can_write_case(case_id) AND (created_by = ( SELECT private.active_uid() AS active_uid))));


--
-- Name: tasks tasks_select_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select_via_case ON public.tasks FOR SELECT TO authenticated USING (private.can_see_case(case_id));


--
-- Name: tasks tasks_update_via_case; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_update_via_case ON public.tasks FOR UPDATE TO authenticated USING (private.can_write_case(case_id)) WITH CHECK (private.can_write_case(case_id));


--
-- Name: user_notify_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notify_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_delete_managed_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_delete_managed_roles ON public.users FOR DELETE TO authenticated USING (private.can_manage_target_user(role));


--
-- Name: users users_insert_managed_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_managed_roles ON public.users FOR INSERT TO authenticated WITH CHECK (private.can_manage_target_user(role));


--
-- Name: users users_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_all ON public.users FOR SELECT TO authenticated USING ((( SELECT private.active_uid() AS active_uid) IS NOT NULL));


--
-- Name: users users_update_managed_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_managed_roles ON public.users FOR UPDATE TO authenticated USING (private.can_manage_target_user(role)) WITH CHECK (private.can_manage_target_user(role));


--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO authenticated;


--
-- Name: FUNCTION absence_can_write(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.absence_can_write(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION absence_user_visible(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.absence_user_visible(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION active_uid(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.active_uid() TO authenticated;


--
-- Name: FUNCTION can(p_cap text, p_target uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can(p_cap text, p_target uuid) TO authenticated;


--
-- Name: FUNCTION can_create_clients(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_create_clients() TO authenticated;


--
-- Name: FUNCTION can_manage_target_user(target_role public.user_role); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_manage_target_user(target_role public.user_role) TO authenticated;


--
-- Name: FUNCTION can_manage_user_salary(p_target uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_manage_user_salary(p_target uuid) TO authenticated;


--
-- Name: FUNCTION can_manage_users(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_manage_users() TO authenticated;


--
-- Name: FUNCTION can_see_all_cases(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_see_all_cases() TO authenticated;


--
-- Name: FUNCTION can_see_case(p_case_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_see_case(p_case_id uuid) TO authenticated;


--
-- Name: FUNCTION can_see_client(p_client_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_see_client(p_client_id uuid) TO authenticated;


--
-- Name: FUNCTION can_write_case(p_case_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.can_write_case(p_case_id uuid) TO authenticated;


--
-- Name: FUNCTION case_dept_visible(p_lawyer uuid, p_responsible uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.case_dept_visible(p_lawyer uuid, p_responsible uuid) TO authenticated;


--
-- Name: FUNCTION case_id_from_storage_path(p_path text); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.case_id_from_storage_path(p_path text) TO authenticated;


--
-- Name: FUNCTION case_visible(p_lawyer uuid, p_responsible uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.case_visible(p_lawyer uuid, p_responsible uuid) TO authenticated;


--
-- Name: FUNCTION cash_kind_for_method(p_method text); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.cash_kind_for_method(p_method text) TO authenticated;


--
-- Name: FUNCTION cash_resolve_account(p_method text); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.cash_resolve_account(p_method text) TO authenticated;


--
-- Name: FUNCTION current_user_department(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.current_user_department() TO authenticated;


--
-- Name: FUNCTION current_user_role(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.current_user_role() TO authenticated;


--
-- Name: FUNCTION is_owner(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_owner() TO authenticated;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_staff() TO authenticated;


--
-- Name: FUNCTION payroll_see_all(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.payroll_see_all() TO authenticated;


--
-- Name: FUNCTION payroll_user_visible(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.payroll_user_visible(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION scope_is_all(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.scope_is_all() TO authenticated;


--
-- Name: FUNCTION case_payroll(p_case_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.case_payroll(p_case_id uuid) TO authenticated;


--
-- Name: FUNCTION cash_backfill_payments(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cash_backfill_payments() TO authenticated;


--
-- Name: FUNCTION cash_balances_before(p_before date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cash_balances_before(p_before date) TO authenticated;


--
-- Name: FUNCTION cash_unsynced_payments_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cash_unsynced_payments_count() TO authenticated;


--
-- Name: FUNCTION close_case_lost(p_case_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_case_lost(p_case_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION confirm_act_paid(p_act_id uuid, p_confirmed_amount numeric, p_paid_at date, p_storage_key text, p_file_name text, p_method text, p_note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confirm_act_paid(p_act_id uuid, p_confirmed_amount numeric, p_paid_at date, p_storage_key text, p_file_name text, p_method text, p_note text) TO authenticated;


--
-- Name: FUNCTION conflict_check(p_name text, p_inn text, p_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.conflict_check(p_name text, p_inn text, p_phone text) TO authenticated;


--
-- Name: FUNCTION create_payout(p_user_id uuid, p_comment text, p_occurred_on date, p_allocations jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_payout(p_user_id uuid, p_comment text, p_occurred_on date, p_allocations jsonb) TO authenticated;


--
-- Name: FUNCTION dashboard_payment_months(p_from date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dashboard_payment_months(p_from date) TO authenticated;


--
-- Name: FUNCTION dashboard_sources(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dashboard_sources(p_from date, p_to date) TO authenticated;


--
-- Name: FUNCTION dashboard_stock_months(p_from date, p_user_id uuid, p_fixed uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dashboard_stock_months(p_from date, p_user_id uuid, p_fixed uuid[]) TO authenticated;


--
-- Name: FUNCTION debt_aging(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.debt_aging() TO authenticated;


--
-- Name: FUNCTION get_user_login_secret(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_login_secret(p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb) TO authenticated;


--
-- Name: FUNCTION manage_user_salaries(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.manage_user_salaries() TO authenticated;


--
-- Name: FUNCTION notify_reissue_calendar_token(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_reissue_calendar_token() TO authenticated;


--
-- Name: FUNCTION overdue_plan_items(p_today date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.overdue_plan_items(p_today date) TO authenticated;


--
-- Name: FUNCTION payroll_by_specialist(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.payroll_by_specialist() TO authenticated;


--
-- Name: FUNCTION payroll_employee_cases(p_user_id uuid, p_month date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.payroll_employee_cases(p_user_id uuid, p_month date) TO authenticated;


--
-- Name: FUNCTION payroll_employee_summary(p_month date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.payroll_employee_summary(p_month date) TO authenticated;


--
-- Name: FUNCTION payroll_payout_by_specialist(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.payroll_payout_by_specialist() TO authenticated;


--
-- Name: FUNCTION revert_payout(p_ledger_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revert_payout(p_ledger_id uuid) TO authenticated;


--
-- Name: FUNCTION search_case_ids(p_q text, p_stage public.case_stage, p_case_type public.case_type, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_case_ids(p_q text, p_stage public.case_stage, p_case_type public.case_type, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text) TO authenticated;


--
-- Name: FUNCTION set_act_completion(p_act_id uuid, p_completion text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_act_completion(p_act_id uuid, p_completion text) TO authenticated;


--
-- Name: FUNCTION set_my_language(lang text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_language(lang text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_language(lang text) TO authenticated;


--
-- Name: FUNCTION set_user_login_secret(p_user_id uuid, p_password text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_user_login_secret(p_user_id uuid, p_password text) TO authenticated;


--
-- Name: FUNCTION user_delete_blockers(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_delete_blockers(p_user_id uuid) TO authenticated;


--
-- Name: TABLE absences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.absences TO authenticated;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_log TO authenticated;


--
-- Name: SEQUENCE activity_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.activity_log_id_seq TO authenticated;


--
-- Name: SEQUENCE case_act_number_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.case_act_number_seq TO authenticated;


--
-- Name: TABLE case_acts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.case_acts TO authenticated;


--
-- Name: TABLE case_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.case_comments TO authenticated;


--
-- Name: TABLE cases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cases TO authenticated;


--
-- Name: TABLE cash_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_accounts TO authenticated;


--
-- Name: TABLE cash_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_entries TO authenticated;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clients TO authenticated;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.departments TO authenticated;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documents TO authenticated;


--
-- Name: TABLE org_requisites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.org_requisites TO authenticated;


--
-- Name: TABLE payment_plan_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_plan_items TO authenticated;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payments TO authenticated;


--
-- Name: TABLE payout_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payout_allocations TO authenticated;


--
-- Name: TABLE payroll_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payroll_ledger TO authenticated;


--
-- Name: TABLE payroll_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payroll_rates TO authenticated;


--
-- Name: TABLE payroll_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payroll_transactions TO authenticated;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO authenticated;


--
-- Name: TABLE user_notify_channels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_notify_channels TO authenticated;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(full_name) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.email; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(email) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(role) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_active) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.perm_overrides; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(perm_overrides) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.language; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(language) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.department_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(department_id) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users."position"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("position") ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.visibility_scope; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(visibility_scope) ON TABLE public.users TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


