-- Юр CRM — v2 Этап 1: БД-фундамент подразделений (docs/PLAN-V2.md).
--
-- Только схема и данные: поведение системы НЕ меняется. Видимость по
-- подразделениям (can_see_case и далее) переключается отдельно — Этап 2.
--
--   1) departments — справочник подразделений (10 шт., имена 5–10 клиент даст позже);
--   2) users.department_id / users.position — привязка сотрудника и должность;
--   3) users.visibility_scope — 'department' | 'all' для admin/office_manager
--      (начнёт действовать в RLS Этапа 2; owner всегда видит всё,
--      lawyer/expert — всегда только свои дела, scope на них не влияет);
--   4) RLS departments: читают все активные сотрудники, пишет только owner;
--   5) гард users_guard_visibility_fields: visibility_scope/department_id
--      меняет только owner (спека «Выставляет только owner» — enforce в БД);
--   6) сидинг 10 подразделений (идемпотентно по unique name — попадёт и на прод
--      при db push, отдельный сид не нужен).

-- ========================================================================
-- 1) departments
-- ========================================================================

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.departments is
  'Подразделения (филиалы). С Этапа 2 v2 видимость admin/office_manager скоупится по ним.';

-- ========================================================================
-- 2) users: подразделение, должность, настраиваемая видимость
-- ========================================================================

-- department_id сознательно БЕЗ on delete: удалить подразделение, на которое
-- ссылаются сотрудники, нельзя (23503) — сперва перевести людей. set null не
-- годится: NULL = переходное «видит всё» (молчаливое расширение видимости).
-- Штатный путь вывода из работы — is_active = false.
alter table public.users
  add column department_id uuid references public.departments(id),
  add column position text,
  add column visibility_scope text not null default 'department'
    constraint users_visibility_scope_check
    check (visibility_scope in ('department', 'all'));

-- RLS Этапа 2 будет джойнить дела на подразделения юриста/Експерта.
create index users_department_id_idx on public.users(department_id);

comment on column public.users.department_id is
  'Подразделение сотрудника. NULL — вне структуры; для admin/office_manager NULL = переходное «видит всё» (PLAN-V2).';
comment on column public.users.position is
  'Отображаемая должность (свободный текст: керівник, заступник, юрист ВП, менеджер ВП, експерт, адміністратор). На права НЕ влияет — права задаёт role.';
comment on column public.users.visibility_scope is
  'Для admin/office_manager: department — видит только своё подразделение, all — всю компанию. Выставляет только owner (БД-гард users_guard_visibility_fields). Для owner/lawyer/expert не действует.';

-- ========================================================================
-- 3) RLS departments
-- ========================================================================

alter table public.departments enable row level security;

-- Чтение — любой активный сотрудник: справочник нужен фильтрам, карточкам,
-- формам. active_uid() (а не голый auth.uid()) — деактивированный сотрудник
-- с живым токеном не должен читать структуру компании.
create policy departments_select_active
  on public.departments
  for select
  to authenticated
  using ((select private.active_uid()) is not null);

-- Запись (создание/переименование/деактивация/удаление) — только owner:
-- управление структурой компании = системная настройка (CLAUDE.md §4).
create policy departments_write_owner
  on public.departments
  for all
  to authenticated
  using (private.is_owner())
  with check (private.is_owner());

-- ========================================================================
-- 4) Гард: visibility_scope / department_id меняет только owner
-- ========================================================================
-- Спека (PLAN-V2): «Выставляет только owner». Без гарда политика
-- users_update_managed_roles позволила бы admin'у выдать office_manager'у
-- scope='all' или перекинуть юриста между подразделениями — с Этапа 2 это
-- расширение видимости (эскалация). По образцу guard_perm_overrides_change:
-- путь service_role (auth.uid() IS NULL — сид, серверные задачи) пропускаем.
-- position не охраняем: отображаемый текст, на права не влияет.

create or replace function private.guard_user_visibility_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create trigger users_guard_visibility_fields
  before insert or update of visibility_scope, department_id on public.users
  for each row execute function private.guard_user_visibility_fields();

-- ========================================================================
-- 5) Сидинг 10 подразделений
-- ========================================================================
-- 4 именованных + 6 заглушек «Підрозділ N» — клиент переименует позже из UI.

insert into public.departments (name) values
  ('Київський'),
  ('Дніпровський'),
  ('Львівський'),
  ('Одеський'),
  ('Підрозділ 5'),
  ('Підрозділ 6'),
  ('Підрозділ 7'),
  ('Підрозділ 8'),
  ('Підрозділ 9'),
  ('Підрозділ 10')
on conflict (name) do nothing;
