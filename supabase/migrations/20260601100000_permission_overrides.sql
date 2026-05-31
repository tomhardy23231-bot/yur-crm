-- Юр CRM — Персональные права поверх ролей (per-user permission overrides).
--
-- Идея: ролевая модель (CLAUDE.md §4) остаётся ДЕФОЛТОМ. Дополнительно у каждого
-- пользователя есть public.users.perm_overrides (jsonb) — точечные права:
--   ключ есть, true  → РАЗРЕШЕНО (поверх роли);
--   ключ есть, false → ЗАПРЕЩЕНО (поверх роли);
--   ключа нет        → НАСЛЕДУЕТ дефолт роли (private.cap_role_default).
-- Пустое поле '{}' => поведение РОВНО как раньше (нулевое изменение при деплое).
--
-- 11 настраиваемых прав (решение владельца):
--   view_all_cases      — видеть и редактировать ВСЕ дела (и их клиентов,
--                          документы, задачи, платежи)         [дефолт: staff]
--   create_cases        — создавать дела                        [staff]
--   delete_cases        — удалять дела                          [owner/admin]
--   create_clients      — создавать клиентов     [owner/admin/office_manager/lawyer]
--   delete_clients      — удалять клиентов                      [owner/admin]
--   delete_documents    — удалять документы                     [owner/admin]
--   edit_payments       — изменять и удалять платежи            [owner/admin]
--   view_all_payroll    — видеть зарплату всех                  [staff]
--   edit_rate_overrides — менять % зарплаты на деле             [owner/admin]
--   manage_users        — управление пользователями             [owner/admin]
--   edit_payroll_rates  — системные ставки зарплаты             [owner]
--
-- Источник правды — БД: политики/триггеры/функции зовут private.can(...).
-- Грант прав защищён private.can_grant_cap (ступенчатые права + анти-эскалация).
-- Откат: drop колонки perm_overrides + восстановить прежние предикаты политик
-- (is_staff()/can_manage_users()/is_owner()/can_create_clients()).

-- ========================================================================
-- 1) Колонка хранения оверрайдов
-- ========================================================================

alter table public.users
  add column perm_overrides jsonb not null default '{}'::jsonb;

comment on column public.users.perm_overrides is
  'Персональные права поверх роли (tri-state по ключу: true=разрешено, '
  'false=запрещено, нет ключа=наследует дефолт роли). Пусто {} = как у роли. '
  'Допустимые ключи валидируются триггером users_perm_overrides_1_validate.';

-- ========================================================================
-- 2) Дефолт права по роли — централизует прежние «разбросанные» role-проверки
-- ========================================================================
-- Значения 1:1 повторяют текущие хелперы (is_staff/can_manage_users/is_owner/
-- can_create_clients), поэтому при пустых оверрайдах эффективное право не меняется.

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
    else false
  end
$$;

comment on function private.cap_role_default(text, public.user_role) is
  'Дефолт права по роли (источник истины для эффективного права, зеркалится в TS '
  'capRoleDefault). Должна совпадать с TS — проверяется CI parity-тестом.';

-- ========================================================================
-- 3) private.can(cap, target) — ЭФФЕКТИВНОЕ право (оверрайд → дефолт роли)
-- ========================================================================
-- target по умолчанию = текущий пользователь (auth.uid()). Деактивированный или
-- несуществующий пользователь → всегда false (kill-switch как у active_uid()).

create or replace function private.can(p_cap text, p_target uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
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

grant execute on function private.can(text, uuid) to authenticated;

comment on function private.can(text, uuid) is
  'Эффективное право пользователя: оверрайд (perm_overrides) > дефолт роли. '
  'Деактивированный/несуществующий → false. Источник правды для RLS. '
  'Используется в политиках вместо is_staff()/can_manage_users()/is_owner().';

-- ========================================================================
-- 4) Ступенчатые права на управление пользователем — теперь cap-aware
-- ========================================================================
-- owner (по роли) → любой; иначе обладатель права manage_users → только
-- не-владелец/не-админ. Прежнее поведение owner/admin сохраняется (manage_users
-- по дефолту = owner/admin), но теперь право можно выдать и иному пользователю.

create or replace function private.can_manage_target_user(target_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.can('manage_users') then false
    when private.is_owner() then true
    else target_role in ('office_manager', 'lawyer', 'expert')
  end
$$;

comment on function private.can_manage_target_user(public.user_role) is
  'Ступенчатые права на управление пользователем (cap-aware): нужен manage_users; '
  'owner-по-роли — любой; иной обладатель права — только office_manager/lawyer/expert. '
  'Защищает от повышения до owner/admin не-владельцем.';

-- ========================================================================
-- 5) private.can_grant_cap(cap, target) — кто вправе ВЫДАВАТЬ/СНИМАТЬ право
-- ========================================================================
-- Защита от эскалации (решения владельца):
--   - нельзя править собственные права (target = auth.uid());
--   - актор должен иметь право управлять этим пользователем (стклад. зона);
--   - 'edit_payroll_rates' (системные настройки) выдаёт ТОЛЬКО владелец;
--   - 'manage_users' выдают только owner/admin ПО РОЛИ (без каскада через
--     выданное право — иначе обладатель права плодил бы новых управляющих);
--   - анти-амплификация: не-владелец не может выдать право, которого нет у него.

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

comment on function private.can_grant_cap(text, uuid) is
  'Кто вправе менять конкретное право у конкретного пользователя. Ступенчатые '
  'права + анти-эскалация: нет self-edit, edit_payroll_rates — только owner, '
  'manage_users — только owner/admin по роли, не-владелец не выдаёт чего не имеет.';

-- ========================================================================
-- 6) Триггеры на public.users: валидация формы, охрана выдачи, сброс при роли
-- ========================================================================

-- 6.1 Валидация формы perm_overrides (только известные ключи, только boolean).
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
    'manage_users', 'edit_payroll_rates'
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

create trigger users_perm_overrides_1_validate
  before insert or update of perm_overrides on public.users
  for each row execute function private.validate_perm_overrides();

-- 6.2 Охрана выдачи: каждый ИЗМЕНЁННЫЙ ключ должен проходить can_grant_cap.
-- На пути service_role (auth.uid() IS NULL) триггер пропускает — там страж это
-- серверный код (как при создании auth-пользователя, CLAUDE.md §2).
create or replace function private.guard_perm_overrides_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create trigger users_perm_overrides_2_guard
  before update of perm_overrides on public.users
  for each row execute function private.guard_perm_overrides_change();

-- 6.3 Сброс персональных прав при смене роли (решение владельца).
create or replace function private.reset_perm_overrides_on_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    new.perm_overrides := '{}'::jsonb;
  end if;
  return new;
end;
$$;

create trigger users_role_reset_perms
  before update of role on public.users
  for each row execute function private.reset_perm_overrides_on_role_change();

-- ========================================================================
-- 7) Делаем case-видимость override-aware: can_see_case / can_write_case
-- ========================================================================
-- is_staff() → private.can('view_all_cases'). Дефолт view_all_cases = staff,
-- поэтому поведение staff/lawyer/expert не меняется; выдача view_all_cases даёт
-- доступ к делу и его документам/задачам/платежам.

create or replace function private.can_see_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = p_case_id
      and (
        private.can('view_all_cases')
        or c.lawyer_id = private.active_uid()
        or c.responsible_id = private.active_uid()
      )
  )
$$;

-- can_write_case по-прежнему делегирует в can_see_case (Phase 1: видеть = писать).

-- ========================================================================
-- 8) can_create_clients() → делегирует в private.can('create_clients')
-- ========================================================================

create or replace function private.can_create_clients()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can('create_clients')
$$;

-- ========================================================================
-- 9) Переписываем политики RLS на private.can(...)
-- ========================================================================

-- cases ------------------------------------------------------------------
drop policy if exists cases_select_visible on public.cases;
create policy cases_select_visible
  on public.cases
  for select
  to authenticated
  using (
    private.can('view_all_cases')
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  );

drop policy if exists cases_insert_staff on public.cases;
create policy cases_insert_staff
  on public.cases
  for insert
  to authenticated
  with check (private.can('create_cases'));

drop policy if exists cases_update_staff_or_assignee on public.cases;
create policy cases_update_staff_or_assignee
  on public.cases
  for update
  to authenticated
  using (
    private.can('view_all_cases')
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  )
  with check (
    private.can('view_all_cases')
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  );

drop policy if exists cases_delete_managers on public.cases;
create policy cases_delete_managers
  on public.cases
  for delete
  to authenticated
  using (private.can('delete_cases'));

-- clients ----------------------------------------------------------------
drop policy if exists clients_select_visible on public.clients;
create policy clients_select_visible
  on public.clients
  for select
  to authenticated
  using (
    private.can('view_all_cases')
    or created_by = (select private.active_uid())
    or exists (
      select 1 from public.cases c
      where c.client_id = clients.id
        and (
          c.lawyer_id = (select private.active_uid())
          or c.responsible_id = (select private.active_uid())
        )
    )
  );

drop policy if exists clients_insert_creators on public.clients;
create policy clients_insert_creators
  on public.clients
  for insert
  to authenticated
  with check (
    private.can('create_clients')
    and created_by = (select private.active_uid())
  );

drop policy if exists clients_update_staff_or_creator on public.clients;
create policy clients_update_staff_or_creator
  on public.clients
  for update
  to authenticated
  using (
    private.can('view_all_cases')
    or created_by = (select private.active_uid())
  )
  with check (
    private.can('view_all_cases')
    or created_by = (select private.active_uid())
  );

drop policy if exists clients_delete_managers on public.clients;
create policy clients_delete_managers
  on public.clients
  for delete
  to authenticated
  using (private.can('delete_clients'));

-- documents --------------------------------------------------------------
drop policy if exists documents_delete_managers on public.documents;
create policy documents_delete_managers
  on public.documents
  for delete
  to authenticated
  using (private.can('delete_documents'));

-- payments ---------------------------------------------------------------
drop policy if exists payments_update_managers on public.payments;
create policy payments_update_managers
  on public.payments
  for update
  to authenticated
  using      (private.can('edit_payments'))
  with check (private.can('edit_payments'));

drop policy if exists payments_delete_managers on public.payments;
create policy payments_delete_managers
  on public.payments
  for delete
  to authenticated
  using (private.can('edit_payments'));

-- payroll_rates ----------------------------------------------------------
drop policy if exists payroll_rates_write_owner on public.payroll_rates;
create policy payroll_rates_write_owner
  on public.payroll_rates
  for all
  to authenticated
  using      (private.can('edit_payroll_rates'))
  with check (private.can('edit_payroll_rates'));

-- payroll_ledger: «видеть зарплату всех» → view_all_payroll --------------
drop policy if exists payroll_ledger_select_staff on public.payroll_ledger;
create policy payroll_ledger_select_staff
  on public.payroll_ledger
  for select
  to authenticated
  using (private.can('view_all_payroll'));
-- payroll_ledger_select_own и payroll_ledger_update_managers НЕ трогаем:
-- «своё» остаётся всем; отметку «выплачено»/откат по-прежнему делает owner/admin
-- (это право в список настраиваемых не включено).

-- users: ступенчатые политики теперь смотрят на manage_users (cap-aware) ---
-- can_manage_target_user уже требует private.can('manage_users'), поэтому базовый
-- гейт переносим на него (раньше — неявно через ту же функцию на ролях).

drop policy if exists users_insert_managed_roles on public.users;
create policy users_insert_managed_roles
  on public.users
  for insert
  to authenticated
  with check (private.can_manage_target_user(role));

drop policy if exists users_update_managed_roles on public.users;
create policy users_update_managed_roles
  on public.users
  for update
  to authenticated
  using      (private.can_manage_target_user(role))
  with check (private.can_manage_target_user(role));

drop policy if exists users_delete_managed_roles on public.users;
create policy users_delete_managed_roles
  on public.users
  for delete
  to authenticated
  using (private.can_manage_target_user(role));

-- ========================================================================
-- 10) Функции, читающие роль напрямую → override-aware
-- ========================================================================

-- 10.1 cases_guard_rate_overrides: can_manage_users() → can('edit_rate_overrides').
create or replace function private.cases_guard_rate_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- 10.2 payroll_by_specialist(): «видят всех» → can('view_all_payroll').
-- Тело идентично 20260530130000 (SECURITY DEFINER + явный фильтр зрителя),
-- меняется только условие «кто видит всех».
create or replace function public.payroll_by_specialist()
returns table (
  user_id      uuid,
  full_name    text,
  role_in_case text,
  case_count   bigint,
  paid_base    numeric,
  earned       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
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
    coalesce(sum(round(a.paid_total * a.percent / 100, 2)), 0)  as earned
  from attributed a
  join public.users u on u.id = a.uid
  -- Не-обладатель view_all_payroll видит ТОЛЬКО свои строки; обладатель — все.
  where private.can('view_all_payroll')
     or a.uid = (select private.active_uid())
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;

grant execute on function public.payroll_by_specialist() to authenticated;

-- ========================================================================
-- 11) activity_log: новое событие user_permissions_changed
-- ========================================================================

alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed'
  ));

-- Пересоздаём log_activity (база — версия из 20260530150000_user_management),
-- добавляя в allowlist 'user_permissions_changed' (entity_type='user' видит/пишет
-- только обладатель manage_users).
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

  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed'
  ) then
    return;
  end if;

  if p_changes is not null and octet_length(p_changes::text) > 8192 then
    return;
  end if;

  v_uid := private.active_uid();
  if v_uid is null then
    return;
  end if;

  if p_entity_type not in ('case', 'client', 'user') then
    return;
  end if;

  v_is_delete_action := p_action in ('case_deleted', 'client_deleted');

  if v_is_delete_action then
    -- Сущность уже удалена → can_see_case вернёт false. Пишем лог, если у актора
    -- есть соответствующее право удаления (раньше был is_staff(); теперь право
    -- delete_* можно выдать персонально, и его действие тоже должно журналироваться).
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

    -- события по пользователям видит/пишет только обладатель manage_users.
    if p_entity_type = 'user' and not private.can('manage_users') then
      return;
    end if;
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'SECURITY DEFINER, allowlist (+user_permissions_changed), size cap 8 КБ. '
  'entity_type user видит/пишет только обладатель manage_users.';

-- ========================================================================
-- 12) storage.objects: удаление файла дела → право delete_documents
-- ========================================================================
-- Синхронизируем DELETE на физический файл с DELETE строки public.documents
-- (documents_delete_managers = private.can('delete_documents')). Раньше политика
-- бакета звала is_staff() по роли — при персональной выдаче/снятии delete_documents
-- запись и файл расходились бы (строка удалена, файл осиротел; или наоборот).
drop policy if exists case_documents_delete_staff on storage.objects;
create policy case_documents_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'case-documents'
    and private.can('delete_documents')
  );
