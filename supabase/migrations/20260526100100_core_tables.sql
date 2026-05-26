-- Юр CRM — Шаг 1: 7 доменных таблиц (CLAUDE.md §5) + триггеры пересчёта финансов.
-- RLS включается отдельной миграцией (20260526100200_rls_policies.sql),
-- чтобы политики писать единым блоком и легче ревьюить.

-- =====================================================================
-- users — сотрудники компании. id зеркалит auth.users.id.
-- =====================================================================

create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  email           text not null unique,
  role            public.user_role not null,
  specialist_type public.specialist_type,
  supervisor_id   uuid references public.users(id) on delete restrict,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  -- specialist_type есть тогда и только тогда, когда роль = specialist.
  constraint users_specialist_type_matches_role
    check ((role = 'specialist') = (specialist_type is not null)),

  -- supervisor_id есть тогда и только тогда, когда роль = assistant.
  constraint users_supervisor_matches_role
    check ((role = 'assistant') = (supervisor_id is not null))
);

create index users_role_idx          on public.users(role);
create index users_supervisor_id_idx on public.users(supervisor_id) where supervisor_id is not null;

comment on table public.users is 'Сотрудники компании. id зеркалит auth.users.id.';

-- supervisor_id (для assistant) обязан указывать на специалиста, не на
-- админа/другого ассистента. CHECK не умеет в FK на чужое поле — нужен триггер
-- (Self-review tail B). Аналогично cases_validate_responsible ниже.
create or replace function private.users_validate_supervisor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  if new.supervisor_id is null then
    return new;
  end if;
  select role into v_role from public.users where id = new.supervisor_id;
  if v_role is null then
    raise exception 'supervisor_id % does not exist in public.users', new.supervisor_id;
  end if;
  if v_role <> 'specialist' then
    raise exception 'supervisor_id must reference a specialist, got role=%', v_role;
  end if;
  return new;
end;
$$;

create trigger users_validate_supervisor
before insert or update of supervisor_id on public.users
for each row execute function private.users_validate_supervisor();

-- =====================================================================
-- clients — доверители
-- =====================================================================

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_kind public.client_kind not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_by  uuid not null references public.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index clients_created_by_idx on public.clients(created_by);
create index clients_name_idx       on public.clients(name);

-- =====================================================================
-- cases — дела (центральная сущность; договор = дело)
-- =====================================================================

create table public.cases (
  id                 uuid primary key default gen_random_uuid(),
  number_title       text not null,
  client_id          uuid not null references public.clients(id) on delete restrict,
  responsible_id     uuid not null references public.users(id)   on delete restrict,
  opened_at          date not null,
  case_type          public.case_type not null,
  stage              public.case_stage not null default 'new_request',
  priority           public.case_priority not null default 'normal',
  tags               text[] not null default '{}',

  contract_sum       numeric(14, 2) not null default 0,
  paid_total         numeric(14, 2) not null default 0,
  debt               numeric(14, 2) not null default 0,
  billing_types      public.billing_type[] not null default '{}',

  opponent           text,
  court_case_number  text,
  court              text,
  closed_at          date,
  created_at         timestamptz not null default now(),

  constraint cases_contract_sum_nonneg check (contract_sum >= 0),
  constraint cases_paid_total_nonneg   check (paid_total >= 0),
  constraint cases_debt_nonneg         check (debt >= 0),

  -- closed_at заполнен <=> этап = closed (стадии «только вперёд», CLAUDE.md §7-2).
  constraint cases_closed_consistency check (
    (stage = 'closed') = (closed_at is not null)
  )
);

create index cases_responsible_idx on public.cases(responsible_id);
create index cases_client_idx      on public.cases(client_id);
create index cases_stage_idx       on public.cases(stage);
create index cases_case_type_idx   on public.cases(case_type);
create index cases_opened_at_idx   on public.cases(opened_at desc);

-- responsible_id должен указывать на специалиста (lawyer/jurist).
-- Делаем триггером, потому что CHECK не может ходить в другую таблицу.
create or replace function private.cases_validate_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  select role into v_role from public.users where id = new.responsible_id;
  if v_role is null then
    raise exception 'responsible_id % does not exist in public.users', new.responsible_id;
  end if;
  if v_role <> 'specialist' then
    raise exception 'responsible_id must reference a specialist, got role=%', v_role;
  end if;
  return new;
end;
$$;

create trigger cases_validate_responsible
before insert or update of responsible_id on public.cases
for each row execute function private.cases_validate_responsible();

-- =====================================================================
-- documents — файлы по делу (хранятся в Supabase Storage; ключ в storage_key)
-- =====================================================================

-- ON DELETE RESTRICT на case_id: документы (договоры, доверенности) —
-- юридически значимые записи, нельзя терять при удалении дела.
-- Удаление дела сначала требует ручной архивации/удаления документов (CSO finding #3).
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete restrict,
  file_name   text not null,
  storage_key text not null,
  doc_type    public.doc_type not null default 'other',
  uploaded_by uuid not null references public.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create index documents_case_idx on public.documents(case_id);

-- =====================================================================
-- tasks — задачи, заседания, дедлайны (питают общий календарь)
-- =====================================================================

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  title       text not null,
  description text,
  kind        public.task_kind not null default 'task',
  assignee_id uuid not null references public.users(id) on delete restrict,
  created_by  uuid not null references public.users(id) on delete restrict,
  due_at      timestamptz,
  status      public.task_status not null default 'open',
  created_at  timestamptz not null default now()
);

create index tasks_case_idx       on public.tasks(case_id);
create index tasks_assignee_idx   on public.tasks(assignee_id);
create index tasks_due_open_idx   on public.tasks(due_at) where status = 'open';
create index tasks_status_idx     on public.tasks(status);

-- =====================================================================
-- payments — оплаты по делу
-- =====================================================================

-- ON DELETE RESTRICT на case_id: финансовая история — аудит-критичные данные
-- (НК Украины: налоговые документы хранятся 1095 дней минимум).
-- Удаление дела с платежами требует ручной архивации (CSO finding #3).
create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete restrict,
  amount     numeric(14, 2) not null,
  paid_at    date not null,
  method     text,
  note       text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint payments_amount_positive check (amount > 0)
);

create index payments_case_idx    on public.payments(case_id);
create index payments_paid_at_idx on public.payments(paid_at desc);

-- =====================================================================
-- activity_log — журнал изменений (CLAUDE.md §7-7)
-- =====================================================================

create table public.activity_log (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid not null,
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,
  changes     jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_entity_idx     on public.activity_log(entity_type, entity_id, created_at desc);
create index activity_log_user_idx       on public.activity_log(user_id, created_at desc);
create index activity_log_created_at_idx on public.activity_log(created_at desc);

-- =====================================================================
-- Авто-пересчёт финансов дела
-- =====================================================================
-- paid_total = SUM(payments.amount) для дела;
-- debt       = max(0, contract_sum - paid_total).
-- Считаем триггерами, чтобы list-view сразу мог сортировать/фильтровать по долгу
-- без подзапроса и без drift между UI и БД.

create or replace function private.recalc_case_totals(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric(14, 2);
begin
  if p_case_id is null then
    return;
  end if;

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

create or replace function private.payments_recalc_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create trigger payments_recalc
after insert or update or delete on public.payments
for each row execute function private.payments_recalc_trigger();

-- debt = max(0, contract_sum - paid_total) — деривативное поле.
-- Триггер срабатывает:
--   - на INSERT (иначе новое дело с contract_sum=N остаётся с debt=0 default — найдено smoke-тестом);
--   - на UPDATE contract_sum (правят сумму договора);
--   - на UPDATE paid_total (recalc_case_totals после insert/delete платежа).
-- set search_path = '' для единообразия с остальными private.* функциями.
create or replace function private.cases_recompute_debt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.debt := greatest(new.contract_sum - coalesce(new.paid_total, 0), 0);
  return new;
end;
$$;

create trigger cases_recompute_debt
before insert or update of contract_sum, paid_total on public.cases
for each row execute function private.cases_recompute_debt();
