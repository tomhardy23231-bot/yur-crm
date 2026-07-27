-- ============================================================================
-- 0009_case_expenses.sql — «Витрати по справі»: расходы по делу, статьи расходов,
-- зеркало в кассу (Розхід) и отчёт прибыльности.
--
-- ЗАЧЕМ. До этой миграции в системе были только доходы. Сотрудники на проде
-- обходили это, заводя трату обычным платежом «плюсом» (note/method = «Витрати»).
-- Это ломало сразу три вещи, потому что база ЗП = cases.paid_total =
-- SUM(payments.amount):
--   • ЗП завышалась (и юрист, и Експерт получали % с несуществующего дохода);
--   • появлялась фейковая «переплата», долг занижался;
--   • доход в аналитике был завышен.
--
-- ГЛАВНЫЙ ИНВАРИАНТ. Расходы живут в ОТДЕЛЬНОЙ таблице public.case_expenses.
-- Ни одно выражение SUM(payments.amount) / cases.paid_total этой миграцией НЕ
-- трогается → база ЗП физически не может измениться. Функции case_payroll /
-- payroll_by_specialist / payroll_employee_summary / payroll_employee_cases
-- (0007_dual_role_rate.sql) и dashboard_* остаются как были.
--
-- Решения владельца (2026-07-24):
--   • расход СПИСЫВАЕТ деньги со счёта (Карта/Рахунок/Готівка) и попадает
--     в общую оборотку /reports/cash как Розхід;
--   • статьи расходов — редактируемый из интерфейса справочник (как типы дел);
--   • на карточке дела — Дохід / Витрати / Маржа, плюс отдельный отчёт;
--   • расходы НЕ влияют на ЗП: не дают процент и не уменьшают базу;
--   • кто вносит и кто видит расходы — отдельные права-галочки, назначают
--     владелец и керівник підрозділу.
--
-- Зеркала в TS (та же правка): CAPABILITIES / CAP_ROLE_DEFAULTS в
-- src/lib/types/db.ts; Prisma — модели case_expenses / expense_categories и
-- поле cash_entries.expense_id.
-- ============================================================================

-- ── 1. Три новых права (16 → 19) ─────────────────────────────────────────────
-- Прежний список (0008_case_types) сохранён ЦЕЛИКОМ + 3 новых. Должен совпадать
-- с TS CAP_ROLE_DEFAULTS.
--
--   view_case_expenses        — видеть блок «Витрати», маржу и отчёт прибыльности;
--   manage_case_expenses      — вносить и удалять расходы по делу;
--   manage_expense_categories — справочник статей расходов в настройках.
--
-- Дефолты: просмотр и внесение — staff (owner/admin/office_manager), справочник —
-- owner/admin. Юрист/Експерт по умолчанию расходов НЕ видят; владелец или
-- керівник включает галочку точечно тому, кто реально платит судовий збір.
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
    when p_cap = 'view_case_expenses'        then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'manage_case_expenses'      then p_role in ('owner', 'admin', 'office_manager')
    when p_cap = 'manage_expense_categories' then p_role in ('owner', 'admin')
    else false
  end
$$;

comment on function private.cap_role_default(p_cap text, p_role public.user_role) is
  'Дефолт права по роли (источник истины эффективного права, зеркалится в TS capRoleDefault). Должна совпадать с TS. 2026-07-24: +view_case_expenses/manage_case_expenses (staff) и +manage_expense_categories (owner/admin) — расходы по делу.';

-- Валидация ключей perm_overrides: +3 новых права в allowlist.
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
    'manage_case_types',
    'view_case_expenses', 'manage_case_expenses', 'manage_expense_categories'
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

-- private.can_grant_cap НЕ трогаем: новые права выдают owner и admin по общей
-- ветке анти-амплификации (владелец просил, чтобы назначать мог и керівник) —
-- спец-условие «только owner», как у кассы и ставок ЗП, здесь НЕ нужно.

-- ── 2. Справочник статей расходов ────────────────────────────────────────────
create table public.expense_categories (
    id          uuid default gen_random_uuid() not null,
    code        text not null,
    name        text not null,
    is_builtin  boolean default false not null,
    is_active   boolean default true not null,
    sort_order  integer default 0 not null,
    created_at  timestamp with time zone default now() not null
);

alter table only public.expense_categories
    add constraint expense_categories_pkey primary key (id);
alter table only public.expense_categories
    add constraint expense_categories_code_key unique (code);

comment on table public.expense_categories is
  'Справочник статей расходов (case_expenses.category_id). Редактируется из интерфейса по праву manage_expense_categories. code — стабильный идентификатор; name — отображаемое название (для встроенных лейбл берётся из i18n enums.expenseCategory по code, name — фолбэк). is_builtin — встроенная статья (не переименовывается, но может быть скрыта). Удаления нет: скрытие через is_active=false. 2026-07-24.';

alter table public.expense_categories enable row level security;

-- Читают все активные сотрудники (справочник нужен формам и отчётам).
create policy expense_categories_select_active on public.expense_categories
    for select to authenticated
    using (((select private.active_uid()) is not null));

-- Пишут (создание/переименование/скрытие) — обладатели manage_expense_categories.
create policy expense_categories_write_manage on public.expense_categories
    to authenticated
    using (private.can('manage_expense_categories'::text))
    with check (private.can('manage_expense_categories'::text));

grant all on table public.expense_categories to authenticated;

-- Сид: 9 встроенных статей. Реальный показ встроенных берётся из i18n по code.
insert into public.expense_categories (code, name, is_builtin, is_active, sort_order) values
    ('court_fee',   'Судовий збір',        true, true, 10),
    ('state_duty',  'Держмито',            true, true, 20),
    ('expertise',   'Експертиза',          true, true, 30),
    ('travel',      'Відрядження',         true, true, 40),
    ('rent',        'Оренда',              true, true, 50),
    ('advertising', 'Реклама',             true, true, 60),
    ('taxes',       'Податки та збори',    true, true, 70),
    ('bank_fees',   'Банківські комісії',  true, true, 80),
    ('other',       'Інше',                true, true, 90)
on conflict (code) do nothing;

-- ── 3. Расходы по делу ───────────────────────────────────────────────────────
-- method — код счёта списания (card|bank|cash). В отличие от payments.method
-- (свободный текст) здесь код ЗАКРЫТЫЙ: от него зависит, на какой счёт кассы
-- ляжет Розхід (private.cash_kind_for_method). Свободный текст ушёл бы в фолбэк
-- на дефолтный счёт и делал бы оборотку неточной.
create table public.case_expenses (
    id          uuid default gen_random_uuid() not null,
    case_id     uuid not null,
    category_id uuid not null,
    amount      numeric(14,2) not null,
    spent_at    date not null,
    method      text not null,
    note        text,
    created_by  uuid not null,
    created_at  timestamp with time zone default now() not null,
    constraint case_expenses_amount_positive check ((amount > (0)::numeric)),
    constraint case_expenses_method_valid check ((method = any (array['card'::text, 'bank'::text, 'cash'::text]))),
    constraint case_expenses_note_len check ((char_length(note) <= 500))
);

alter table only public.case_expenses
    add constraint case_expenses_pkey primary key (id);

alter table only public.case_expenses
    add constraint case_expenses_case_id_fkey foreign key (case_id)
        references public.cases(id) on delete cascade;
-- RESTRICT: статью, по которой уже есть расходы, нельзя убрать (в UI удаления
-- нет вовсе — только is_active=false, это страховка на уровне БД).
alter table only public.case_expenses
    add constraint case_expenses_category_id_fkey foreign key (category_id)
        references public.expense_categories(id) on delete restrict;
alter table only public.case_expenses
    add constraint case_expenses_created_by_fkey foreign key (created_by)
        references public.users(id) on delete restrict;

create index case_expenses_case_id_idx on public.case_expenses using btree (case_id);
create index case_expenses_category_id_idx on public.case_expenses using btree (category_id);
create index case_expenses_spent_at_idx on public.case_expenses using btree (spent_at);

comment on table public.case_expenses is
  'Расходы по делу (судовий збір, експертиза, оренда…). ИСТОЧНИК ПРАВДЫ расходной части. НЕ влияет на ЗП: база ЗП = cases.paid_total = SUM(payments.amount), эта таблица в расчёт зарплаты не входит НИГДЕ. Зеркалится в кассу расходом триггером cash_sync_on_expense. Правки нет (UPDATE-политики нет): изменение = удалить и внести заново. v2026-07-24.';

alter table public.case_expenses enable row level security;

-- Видимость: право view_case_expenses И видимость самого дела. Композиция важна —
-- выдача права юристу НЕ открывает ему чужие дела.
create policy case_expenses_select_via_case on public.case_expenses
    for select to authenticated
    using (private.can_see_case(case_id) and private.can('view_case_expenses'::text));

-- Внесение: право manage_case_expenses И право писать в дело, автор проставлен.
create policy case_expenses_insert_via_case on public.case_expenses
    for insert to authenticated
    with check (
      private.can_write_case(case_id)
      and private.can('manage_case_expenses'::text)
      and created_by = (select private.active_uid())
    );

-- Удаление: обладатель manage_case_expenses — свои записи, staff-управленцы — любые.
create policy case_expenses_delete_author_or_managers on public.case_expenses
    for delete to authenticated
    using (
      private.can('manage_case_expenses'::text)
      and (created_by = (select private.active_uid()) or private.can_manage_users())
    );

grant all on table public.case_expenses to authenticated;

-- ── 4. Зеркало расхода в кассу (Розхід) ──────────────────────────────────────
-- Симметрично payment_id: системная колонка-связка, пользователю на запись не
-- отдаётся (см. правку политик ниже).
alter table public.cash_entries add column expense_id uuid;

alter table only public.cash_entries
    add constraint cash_entries_expense_id_fkey foreign key (expense_id)
        references public.case_expenses(id) on delete cascade;

create unique index cash_entries_expense_uniq
    on public.cash_entries using btree (expense_id) where (expense_id is not null);

comment on column public.cash_entries.expense_id is
  'Расход по делу, породивший эту строку (авто-Розхід). NOT NULL = системная строка: пользователю на UPDATE/DELETE не отдаётся, правится через сам расход. Удаление расхода снимает строку каскадом. 2026-07-24.';

comment on table public.cash_entries is
  'Операции кассы: direction in/out, amount, entry_date, свободное описание. Авто-строки (payment_id NOT NULL — приход по платежу, expense_id NOT NULL — розхід по расходу дела) создают триггеры и пользователю на UPDATE/DELETE не отдаются (только система). Доступ private.can(can_manage_cash). v2 Этап 7 + расходы 2026-07-24.';

-- Полная калька private.cash_sync_on_payment, но direction='out'.
create function private.cash_sync_on_expense() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_cat     text;
  v_desc    text;
begin
  -- РЕЗОЛВИМ счёт ПЕРВЫМ (та же логика, что у автоприхода платежей): на UPDATE
  -- не удаляем прежнюю строку, если новую положить некуда — иначе молчаливая
  -- потеря расхода.
  v_account := private.cash_resolve_account(new.method);
  if v_account is null then
    -- Касс нет / метод не лёг ни на один счёт. Расход всё равно сохраняется
    -- (триггер не падает), просто не попадает в оборотку.
    return null;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.cash_entries where expense_id = new.id;
  end if;

  select number_title into v_title from public.cases where id = new.case_id;
  select coalesce(nullif(btrim(name), ''), code) into v_cat
    from public.expense_categories where id = new.category_id;

  v_desc := coalesce(v_cat, 'Витрата')
         || coalesce(' · ' || nullif(btrim(new.note), ''), '')
         || coalesce(' — ' || v_title, '');

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, expense_id, created_by)
  values
    (v_account, new.spent_at, 'out', new.amount, left(v_desc, 300), new.case_id, new.id, new.created_by);

  return null;
end;
$$;

create trigger cash_sync_on_expense
    after insert or update on public.case_expenses
    for each row execute function private.cash_sync_on_expense();

-- Строки-зеркала расходов, как и приходы по платежам, руками не правятся.
alter policy cash_entries_insert on public.cash_entries
    with check (
      private.can('can_manage_cash'::text)
      and (created_by = (select private.active_uid()))
      and payment_id is null
      and expense_id is null
    );

alter policy cash_entries_update on public.cash_entries
    using (
      private.can('can_manage_cash'::text)
      and payment_id is null
      and expense_id is null
    )
    with check (
      private.can('can_manage_cash'::text)
      and payment_id is null
      and expense_id is null
    );

alter policy cash_entries_delete on public.cash_entries
    using (
      private.can('can_manage_cash'::text)
      and payment_id is null
      and expense_id is null
    );

-- ── 5. Отчёт прибыльности: дохід / витрати / маржа по делам ──────────────────
-- SECURITY INVOKER (как overdue_plan_items/debt_aging): RLS сама режет строки —
-- дела по private.case_visible, расходы дополнительно по праву view_case_expenses.
-- ВАЖНО: функция ЧИТАЕТ payments.amount только для показа; её не вызывает ни одна
-- payroll-функция, cases.paid_total она не пишет — база ЗП не затрагивается.
create function public.finance_by_case(p_from date default null::date, p_to date default null::date)
    returns table(
      case_id uuid,
      number_title text,
      client_name text,
      lawyer_id uuid,
      responsible_id uuid,
      income numeric,
      expense numeric,
      margin numeric
    )
    language sql stable
    set search_path to ''
    as $$
  with inc as (
    select p.case_id, sum(p.amount) as income
      from public.payments p
     where (p_from is null or p.paid_at >= p_from)
       and (p_to   is null or p.paid_at <= p_to)
     group by p.case_id
  ),
  spent as (
    select e.case_id, sum(e.amount) as expense
      from public.case_expenses e
     where (p_from is null or e.spent_at >= p_from)
       and (p_to   is null or e.spent_at <= p_to)
     group by e.case_id
  )
  select
    c.id,
    c.number_title,
    cl.name,
    c.lawyer_id,
    c.responsible_id,
    coalesce(inc.income, 0)::numeric,
    coalesce(spent.expense, 0)::numeric,
    (coalesce(inc.income, 0) - coalesce(spent.expense, 0))::numeric
  from public.cases c
  left join public.clients cl on cl.id = c.client_id
  left join inc on inc.case_id = c.id
  left join spent on spent.case_id = c.id
  where inc.income is not null or spent.expense is not null
$$;

grant all on function public.finance_by_case(p_from date, p_to date) to authenticated;

comment on function public.finance_by_case(p_from date, p_to date) is
  'Прибыльность по делам за период: income (SUM payments.amount), expense (SUM case_expenses.amount), margin = income - expense. SECURITY INVOKER → RLS: дела режет private.case_visible, расходы дополнительно право view_case_expenses. Читает платежи ТОЛЬКО для показа — на cases.paid_total и расчёт ЗП не влияет. 2026-07-24.';

-- ── 6. Журнал: расходы и справочник статей ───────────────────────────────────
-- CHECK-констрейнт: прежний allowlist (0008) сохранён ЦЕЛИКОМ (гоча 23514) + 7 новых.
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
    'case_type_created'::text, 'case_type_renamed'::text,
    'case_type_activated'::text, 'case_type_deactivated'::text,
    -- расходы по делу и справочник статей (2026-07-24)
    'expense_created'::text, 'expense_deleted'::text,
    'payment_converted_to_expense'::text,
    'expense_category_created'::text, 'expense_category_renamed'::text,
    'expense_category_activated'::text, 'expense_category_deactivated'::text
  ])));

-- Видимость журнала: статьи расходов (expense_category) видят owner (общая ветка)
-- и обладатели manage_expense_categories. События по расходам пишутся под
-- entity_type='case' и наследуют видимость дела.
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
        or (entity_type = 'expense_category'::text and private.can('manage_expense_categories'::text))
      )
    end
  );

-- log_activity: прежний allowlist целиком + 7 новых действий, новый
-- entity_type='expense_category' с гейтом по праву.
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
    'case_type_activated', 'case_type_deactivated',
    'expense_created', 'expense_deleted', 'payment_converted_to_expense',
    'expense_category_created', 'expense_category_renamed',
    'expense_category_activated', 'expense_category_deactivated'
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
    'case_type', 'expense_category'
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

    -- справочник статей расходов пишут обладатели manage_expense_categories.
    if p_entity_type = 'expense_category' and not private.can('manage_expense_categories') then
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
  'Журнал: 2026-07-24 +entity_type expense_category (гейт can(manage_expense_categories)) и 7 действий по расходам/статьям (expense_created/deleted, payment_converted_to_expense, expense_category_*). События по расходам пишутся под entity_type=case. Прежний allowlist сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';
