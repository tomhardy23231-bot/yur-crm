-- ============================================================================
-- 0008_case_types.sql — «Тип справи» из фиксированного ENUM → редактируемый
-- справочник public.case_types, управляемый из интерфейса по новому 16-му праву
-- manage_case_types.
--
-- Решения владельца (2026-07-24):
--   • одно (украинское) название типа;
--   • управление — право-галочка: дефолт ВКЛ у owner+admin, ВЫКЛ у остальных
--     ролей; выдаёт owner/admin (как остальные права управления).
--
-- Зеркала в TS (та же правка): CAPABILITIES / CAP_ROLE_DEFAULTS в
-- src/lib/types/db.ts; Prisma cases.case_type → String + model case_types.
--
-- Данные существующих дел НЕ переносятся: значения cases.case_type
-- (civil..other) уже совпадают с кодами справочника.
-- ============================================================================

-- ── 1. Новое право manage_case_types в системе прав ──────────────────────────
-- Дефолт по роли: +manage_case_types (owner/admin). Полный прежний список
-- (0004_split_capabilities) сохранён целиком — должен совпадать с TS.
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
    when p_cap = 'manage_case_types'   then p_role in ('owner', 'admin')
    else false
  end
$$;

comment on function private.cap_role_default(p_cap text, p_role public.user_role) is
  'Дефолт права по роли (источник истины эффективного права, зеркалится в TS capRoleDefault). Должна совпадать с TS. 2026-07-24: +manage_case_types (owner/admin) — управление справочником типов дел.';

-- Валидация ключей perm_overrides: +manage_case_types в allowlist.
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
    'view_cash', 'can_manage_cash',
    'manage_case_types'
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

-- private.can_grant_cap НЕ трогаем: manage_case_types выдают owner и admin
-- (оба имеют право по дефолту) по общей ветке анти-амплификации — спец-условие
-- (как у кассы/ставок «только owner») здесь не нужно.

-- ── 2. Справочник типов дел ──────────────────────────────────────────────────
create table public.case_types (
    id          uuid default gen_random_uuid() not null,
    code        text not null,
    name        text not null,
    is_builtin  boolean default false not null,
    is_active   boolean default true not null,
    sort_order  integer default 0 not null,
    created_at  timestamp with time zone default now() not null
);

alter table only public.case_types
    add constraint case_types_pkey primary key (id);
alter table only public.case_types
    add constraint case_types_code_key unique (code);

comment on table public.case_types is
  'Справочник типов дел (cases.case_type). Редактируется из интерфейса по праву manage_case_types. code — стабильный идентификатор, хранится в cases.case_type; name — отображаемое название (для встроенных 7 типов лейбл берётся из i18n enums.caseType по code, name — фолбэк). is_builtin — встроенный тип (не переименовывается, но может быть скрыт). 2026-07-24.';

alter table public.case_types enable row level security;

-- Читают все активные сотрудники (справочник для форм/фильтров).
create policy case_types_select_active on public.case_types
    for select to authenticated
    using ((( select private.active_uid() as active_uid) is not null));

-- Пишут (создание/переименование/скрытие) — обладатели права manage_case_types.
create policy case_types_write_manage on public.case_types
    to authenticated
    using (private.can('manage_case_types'::text))
    with check (private.can('manage_case_types'::text));

grant all on table public.case_types to authenticated;

-- Сид: 7 встроенных типов (коды = прежние значения enum) + 2 новых
-- («Військове», «Пенсійне») по запросу клиента. name встроенных = укр. лейбл
-- (реальный показ встроенных берётся из i18n по code).
insert into public.case_types (code, name, is_builtin, is_active, sort_order) values
    ('civil',          'Цивільне',        true,  true, 10),
    ('criminal',       'Кримінальне',     true,  true, 20),
    ('corporate',      'Корпоративне',    true,  true, 30),
    ('administrative', 'Адміністративне', true,  true, 40),
    ('family',         'Сімейне',         true,  true, 50),
    ('labor',          'Трудове',         true,  true, 60),
    ('other',          'Інше',            true,  true, 70),
    ('military',       'Військове',       false, true, 80),
    ('pension',        'Пенсійне',        false, true, 90)
on conflict (code) do nothing;

-- ── 3. cases.case_type: ENUM public.case_type → text + FK на справочник ───────
-- 3.1 Снять функцию поиска, зависящую от типа-enum (пересоздаём ниже с text).
drop function if exists public.search_case_ids(text, public.case_stage, public.case_type, uuid, public.case_category, uuid, uuid, uuid, boolean, date, date, integer, integer, text, text);

-- 3.2 Колонка enum → text (btree-индекс cases_case_type_idx пересоздаётся авто).
alter table public.cases
    alter column case_type type text using case_type::text;

-- 3.3 Тип-enum public.case_type больше не используется.
drop type public.case_type;

-- 3.4 FK: тип дела обязан существовать в справочнике. Скрытие типа =
-- is_active=false (код остаётся) → существующие дела не ломаются; удаления
-- типов в UI нет, поэтому ON DELETE не нужен (NO ACTION как у departments).
alter table only public.cases
    add constraint cases_case_type_fkey foreign key (case_type) references public.case_types(code);

-- 3.5 Пересоздать search_case_ids с параметром p_case_type text (тело идентично
-- прежнему; сравнение c.case_type = p_case_type теперь text = text).
create function public.search_case_ids(p_q text default null::text, p_stage public.case_stage default null::public.case_stage, p_case_type text default null::text, p_responsible_id uuid default null::uuid, p_category public.case_category default null::public.case_category, p_lawyer_id uuid default null::uuid, p_client_id uuid default null::uuid, p_department_id uuid default null::uuid, p_archived boolean default null::boolean, p_closed_from date default null::date, p_closed_to date default null::date, p_limit integer default 20, p_offset integer default 0, p_sort text default 'opened_at'::text, p_dir text default 'desc'::text) returns table(id uuid, total bigint)
    language sql stable
    set search_path to ''
    as $$
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
      case when n.sort_col = 'number_title' and n.sort_dir = 'asc'  then m.number_title end asc  nulls last,
      case when n.sort_col = 'number_title' and n.sort_dir = 'desc' then m.number_title end desc nulls last,
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'asc'  then m.contract_sum end asc  nulls last,
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'desc' then m.contract_sum end desc nulls last,
      case when n.sort_col = 'debt'         and n.sort_dir = 'asc'  then m.debt end         asc  nulls last,
      case when n.sort_col = 'debt'         and n.sort_dir = 'desc' then m.debt end         desc nulls last,
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

grant all on function public.search_case_ids(p_q text, p_stage public.case_stage, p_case_type text, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text) to authenticated;

comment on function public.search_case_ids(p_q text, p_stage public.case_stage, p_case_type text, p_responsible_id uuid, p_category public.case_category, p_lawyer_id uuid, p_client_id uuid, p_department_id uuid, p_archived boolean, p_closed_from date, p_closed_to date, p_limit integer, p_offset integer, p_sort text, p_dir text) is
  'Поиск дел по number_title/opponent/court_case_number/client.name/tags. SECURITY INVOKER → RLS. Возвращает (case_id, total). Фильтры: p_stage/p_case_type (текст-код из case_types, миграция 0008)/p_responsible_id/p_category/p_lawyer_id/p_client_id/p_department_id (юрист ИЛИ эксперт в подразделении) + p_archived + p_closed_from/p_closed_to. p_sort whitelist: number_title|opened_at|contract_sum|debt (default opened_at desc).';

-- ── 4. Журнал: действия по типам дел (entity_type='case_type') ───────────────
-- CHECK-констрейнт: прежний allowlist сохранён целиком (гоча 23514) + 4 новых.
alter table public.activity_log
  drop constraint activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check check ((action = any (array[
    'case_created'::text, 'case_updated'::text, 'case_deleted'::text,
    'stage_corrected'::text, 'case_archived'::text, 'case_restored'::text,
    'case_lost'::text,
    'client_created'::text, 'client_updated'::text, 'client_deleted'::text,
    'document_uploaded'::text, 'document_deleted'::text,
    'payment_created'::text, 'payment_updated'::text, 'payment_deleted'::text,
    'payment_plan_updated'::text,
    'task_created'::text, 'task_updated'::text, 'task_toggled'::text,
    'task_deleted'::text,
    'payroll_paid'::text, 'payroll_reverted'::text, 'payroll_payout'::text,
    'user_created'::text, 'user_role_changed'::text, 'user_deactivated'::text,
    'user_reactivated'::text, 'user_permissions_changed'::text,
    'user_department_changed'::text, 'user_salary_changed'::text,
    'user_password_reset'::text, 'user_email_changed'::text,
    'user_invited'::text, 'user_deleted'::text,
    'comment_edited'::text,
    'department_created'::text, 'department_renamed'::text,
    'department_activated'::text, 'department_deactivated'::text,
    'act_created'::text, 'act_paid'::text, 'act_deleted'::text,
    'comment_added'::text, 'comment_deleted'::text,
    'document_downloaded'::text,
    'act_completion_changed'::text,
    'payroll_bonus'::text, 'payroll_tx_deleted'::text,
    'user_password_changed'::text,
    'user_login'::text, 'user_login_failed'::text,
    'absence_created'::text, 'absence_deleted'::text,
    'cash_account_created'::text, 'cash_account_updated'::text,
    'cash_entry_created'::text, 'cash_entry_updated'::text,
    'cash_entry_deleted'::text,
    'payroll_rates_changed'::text, 'org_requisites_updated'::text,
    -- справочник типов дел (2026-07-24)
    'case_type_created'::text, 'case_type_renamed'::text,
    'case_type_activated'::text, 'case_type_deactivated'::text
  ])));

-- Видимость журнала: типы дел (case_type) видят owner (общая ветка
-- can_see_all_cases) и обладатели manage_case_types.
drop policy activity_log_select_visible on public.activity_log;

create policy activity_log_select_visible on public.activity_log
  for select to authenticated
  using (
    case
      when entity_type = any (array['cash'::text, 'org'::text, 'auth'::text, 'absence'::text])
        then private.is_owner()
      else (
        private.can_see_all_cases()
        or (entity_type = 'case'::text and private.can_see_case(entity_id))
        or (entity_type = 'client'::text and private.can_see_client(entity_id))
        or (entity_type = 'user'::text and private.can('manage_users'::text))
        or (entity_type = 'case_type'::text and private.can('manage_case_types'::text))
      )
    end
  );

-- log_activity: расширенный allowlist (прежний целиком + 4 новых) и запись
-- entity_type='case_type' — только обладателям manage_case_types.
create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_changes jsonb default null::jsonb
) returns void
  language plpgsql security definer
  set search_path to ''
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
    'act_created', 'act_paid', 'act_deleted',
    'comment_added', 'comment_deleted',
    'document_downloaded',
    'act_completion_changed',
    'payroll_bonus', 'payroll_tx_deleted',
    'user_password_changed',
    'user_login', 'user_login_failed',
    'absence_created', 'absence_deleted',
    'cash_account_created', 'cash_account_updated',
    'cash_entry_created', 'cash_entry_updated', 'cash_entry_deleted',
    'payroll_rates_changed', 'org_requisites_updated',
    'case_type_created', 'case_type_renamed',
    'case_type_activated', 'case_type_deactivated'
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

  if p_entity_type not in (
    'case', 'client', 'user', 'department', 'cash', 'org', 'auth', 'absence',
    'case_type'
  ) then
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

    -- события по пользователям пишет обладатель manage_users; исключение —
    -- смена СОБСТВЕННОГО пароля (журнал 2026-07-21): каждый пишет про себя.
    if p_entity_type = 'user' and not (
      private.can('manage_users')
      or (p_action = 'user_password_changed' and p_entity_id = v_uid)
    ) then
      return;
    end if;

    -- структуру компании (подразделения) меняет/видит только owner.
    if p_entity_type = 'department' and not private.is_owner() then
      return;
    end if;

    -- справочник типов дел пишут обладатели manage_case_types.
    if p_entity_type = 'case_type' and not private.can('manage_case_types') then
      return;
    end if;

    -- касса: пишут только менеджеры кассы (право can_manage_cash).
    if p_entity_type = 'cash' and not private.can('can_manage_cash') then
      return;
    end if;

    -- org-события (ставки ЗП, реквизиты) меняет только owner.
    if p_entity_type = 'org' and not private.is_owner() then
      return;
    end if;

    -- auth-события пишутся только про себя (вход/неудачная попытка входа
    -- логируются под учёткой, которой касаются).
    if p_entity_type = 'auth' and not (
      p_entity_id = v_uid
      and p_action in ('user_login', 'user_login_failed')
    ) then
      return;
    end if;

    -- отпуска: кто вправе вносить отсутствие сотруднику (зеркало absences).
    if p_entity_type = 'absence' and not private.absence_can_write(p_entity_id) then
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

comment on function public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb) is
  'Журнал: 2026-07-24 +entity_type case_type (гейт can(manage_case_types)) и 4 действия case_type_created/renamed/activated/deactivated. Прежний allowlist сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';
