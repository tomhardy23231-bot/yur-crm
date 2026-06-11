-- Юр CRM — v3 Сессия 9 (Продукт), часть 1: график платежей по делу.
--
-- Зачем (PLAN-V3 9.1): при рассрочке контроль доплат держится на памяти юриста;
-- нет понятия «плановая доплата к сроку». Таблица плановых позиций (дата + сумма)
-- даёт график; статус позиции (оплачено/ожидает/просрочено) считается на лету
-- из cases.paid_total накопительно (чистая логика в lib/payments/plan.ts — UPDATE
-- позиций не нужен, правка = удалить + создать).
--
-- Доступ — наследуется от дела:
--   • SELECT — кто видит дело (private.can_see_case), как payments/tasks/documents;
--   • INSERT — кто пишет в дело (private.can_write_case — тот же предикат, что
--     гейтит вставку задач tasks_insert_via_case), и created_by = свой uid;
--   • DELETE — кто пишет в дело (правка графика = удалить позицию + создать новую);
--   • UPDATE-политики НЕТ (позиции неизменяемы — правка через delete+insert).

create table public.payment_plan_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  note text check (char_length(note) <= 300),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index payment_plan_items_case_idx
  on public.payment_plan_items (case_id, due_date);

alter table public.payment_plan_items enable row level security;

-- SELECT — наследует видимость дела (как payments/documents/tasks).
create policy plan_select_via_case on public.payment_plan_items
  for select
  to authenticated
  using (private.can_see_case(case_id));

-- INSERT — пишущие в дело (тот же предикат, что у tasks_insert_via_case), и
-- автор = текущий пользователь (защита от подделки created_by).
create policy plan_insert_via_case on public.payment_plan_items
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and created_by = (select private.active_uid())
  );

-- DELETE — пишущие в дело (правка графика = удалить + создать заново).
create policy plan_delete_via_case on public.payment_plan_items
  for delete
  to authenticated
  using (private.can_write_case(case_id));

comment on table public.payment_plan_items is
  'v3 s9: график плановых доплат по делу (дата + сумма). Статус позиции '
  '(оплачено/ожидает/просрочено) считается на лету из cases.paid_total накопительно '
  '(lib/payments/plan.ts). Доступ наследуется от дела (can_see_case/can_write_case); '
  'UPDATE нет — правка через delete+insert.';
