-- ============================================================================
-- 0019_cash_entry_edits.sql — операции кассы становятся редактируемыми, а
-- операции раньше даты открытия счёта — управляемыми.
--
-- ЗАЧЕМ (жалоба клиента через владельца, 2026-08-04):
--   1. «Нельзя редактировать, изменять комментарий, статью и многое другое» —
--      в журнале кассы половина строк это зеркала расходов (Реклама · …,
--      Оренда · …), а у public.expenses не было UPDATE-политики вовсе:
--      правка = удалить и внести заново. Опечатка в комментарии стоила
--      удаления записи (а вместе с ней — авторства и даты внесения).
--   2. Плашка «операції датовані раніше дати початкового залишку» объясняла
--      проблему, но не давала её решить. Владелец: нужны три исхода —
--      перенести дату счёта, перенести дату операции ИЛИ разрешить операции
--      попасть в оборот с её собственной датой.
--
-- ЧТО ЗДЕСЬ.
--   A. UPDATE-политика expenses + гард неизменяемых полей.
--   B. cash_entries.include_before_opening — персональное исключение из
--      отсечки по opening_date («внести в оборот»), и все ЧЕТЫРЕ места
--      расчёта сальдо начинают его учитывать (три здесь, четвёртое —
--      entriesFromOpening в lib/cash/saldo.ts).
--   C. Флаг переживает пересинхронизацию авто-строки (правка платежа/расхода
--      пересоздаёт строку кассы — без этого исключение молча слетало бы).
--   D. expense_updated в allowlist журнала.
--
-- ⚠️ Отсечка по opening_date живёт РОВНО в четырёх местах. Любое новое место,
-- считающее сальдо/обороты, обязано повторить условие
-- `entry_date >= opening_date OR include_before_opening` — иначе экраны
-- покажут разные деньги (журнал считается в TS, отчёты — здесь).
-- ============================================================================

-- ── A. Правка расходов ──────────────────────────────────────────────────────
-- Политика — зеркало expenses_delete (правка не менее разрушительна, чем
-- удаление: до сих пор она им и была) плюс явная видимость дела.
-- Зарплатные авто-строки (payroll_transaction_id) не правятся, как и не
-- создаются руками: они живут и умирают вместе с выплатой.
create policy expenses_update on public.expenses
    for update to authenticated
    using (
      payroll_transaction_id is null
      and (
        case when case_id is null
          then private.can('can_manage_cash'::text)
          else private.can_see_case(case_id)
               and private.can('manage_case_expenses'::text)
               and (created_by = (select private.active_uid()) or private.can_manage_users())
        end
      )
    )
    with check (
      payroll_transaction_id is null
      and (
        case when case_id is null
          then private.can('can_manage_cash'::text)
          else private.can_see_case(case_id)
               and private.can('manage_case_expenses'::text)
               and (created_by = (select private.active_uid()) or private.can_manage_users())
        end
      )
    );

-- Гард: три поля правкой не меняются.
--   case_id — перенос расхода между делом и фирмой означает переезд между
--     ЗОНАМИ ВИДИМОСТИ (трата по делу видна юристу дела, расход фирмы — только
--     кассе, там же зарплата). Такое делается удалением и внесением заново,
--     чтобы след остался в журнале двумя записями, а не одной правкой.
--   created_by — автор записи, на нём держится ветка «автор или управленец».
--   payroll_transaction_id — системная связка с выплатой ЗП.
create function private.guard_expense_update() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if new.case_id is distinct from old.case_id then
    raise exception 'expenses.case_id is immutable (delete and re-create instead)'
      using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'expenses.created_by is immutable'
      using errcode = '42501';
  end if;
  if new.payroll_transaction_id is distinct from old.payroll_transaction_id then
    raise exception 'expenses.payroll_transaction_id is system-managed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function private.guard_expense_update() is
  'Гард правки расхода: case_id / created_by / payroll_transaction_id неизменны. Перенос расхода между делом и фирмой = удалить и внести заново (смена зоны видимости). 2026-08-04 (0019).';

create trigger expenses_guard_update
    before update on public.expenses
    for each row execute function private.guard_expense_update();

comment on table public.expenses is
  'Расходы фирмы. case_id NOT NULL — трата по делу (судовий збір, експертиза), она уменьшает маржу дела; case_id NULL — общефирменный расход (оренда, податки, зв''язок, зарплата, вода). НЕ влияет на ЗП: база ЗП = cases.paid_total = SUM(payments.amount), эта таблица в расчёт зарплаты не входит нигде. Зеркалится в кассу расходом (private.cash_sync_on_expense). Правится (0019) кроме case_id / created_by / payroll_transaction_id — их держит гард expenses_guard_update. v2026-08-04.';

-- ── B. «Внести в оборот» — исключение из отсечки по opening_date ────────────
-- Начальный остаток счёта — это фотография «на такую-то дату на счету было
-- столько», поэтому всё, что датировано раньше, считается уже сидящим внутри
-- неё и в обороты не берётся (иначе деньги посчитаются дважды). Но операцию
-- задним числом заводят и тогда, когда в остаток она НЕ попала. Раньше выход
-- был один — двигать дату начального остатка, а это меняет правило для ВСЕХ
-- операций счёта. Флаг делает исключение точечным.
alter table public.cash_entries
  add column include_before_opening boolean not null default false;

comment on column public.cash_entries.include_before_opening is
  'true — операция учитывается в оборотах и сальдо, даже если датирована раньше opening_date счёта (владелец подтвердил, что в начальный остаток она не вошла). Ставится только через public.cash_entry_set_included под правом can_manage_cash. 2026-08-04 (0019).';

-- Перенос остатка на начало периода.
create or replace function public.cash_balances_before(p_before date) returns table(account_id uuid, balance numeric)
    language sql security definer
    set search_path to ''
    as $$
  select e.account_id,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)
  from public.cash_entries e
  join public.cash_accounts a on a.id = e.account_id
  where e.entry_date < p_before
    -- операции до opening_date уже в opening_balance — кроме внесённых вручную
    and (e.entry_date >= a.opening_date or e.include_before_opening)
    and (private.can('view_cash') or private.can('can_manage_cash'))  -- право внутри DEFINER
  group by e.account_id;
$$;

comment on function public.cash_balances_before(p_before date) is
  'Перенос остатка по счетам кассы строго до p_before (операции раньше opening_date исключены — они уже в opening_balance; исключение снимает cash_entries.include_before_opening). Эффективный остаток на начало = cash_accounts.opening_balance + balance. Право view_cash ИЛИ can_manage_cash. v3 s3; флаг 2026-08-04 (0019).';

-- Обороты по счетам за период.
create or replace function public.cash_turnover(
    p_from date default null::date,
    p_to date default null::date
) returns table(account_id uuid, inflow numeric, outflow numeric, cnt bigint)
    language sql stable security definer
    set search_path to ''
    as $$
  select e.account_id,
         coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric,
         coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric,
         count(*)::bigint
    from public.cash_entries e
    join public.cash_accounts a on a.id = e.account_id
   where (e.entry_date >= a.opening_date or e.include_before_opening)
     and (p_from is null or e.entry_date >= p_from)
     and (p_to   is null or e.entry_date <= p_to)
     and (private.can('view_cash') or private.can('can_manage_cash'))
   group by e.account_id
$$;

comment on function public.cash_turnover(p_from date, p_to date) is
  'Обороты кассы по счетам за период: приход, расход, число операций. Операции раньше opening_date счёта исключены (уже в opening_balance), кроме помеченных include_before_opening. Право view_cash ИЛИ can_manage_cash внутри DEFINER. 2026-08-03 (0017); флаг 2026-08-04 (0019).';

-- Движение денег по месяцам.
create or replace function public.cash_flow_monthly(
    p_from date default null::date,
    p_to date default null::date
) returns table(month date, inflow numeric, outflow numeric, cnt bigint)
    language sql stable security definer
    set search_path to ''
    as $$
  select date_trunc('month', e.entry_date)::date,
         coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric,
         coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric,
         count(*)::bigint
    from public.cash_entries e
    join public.cash_accounts a on a.id = e.account_id
   where (e.entry_date >= a.opening_date or e.include_before_opening)
     and (p_from is null or e.entry_date >= p_from)
     and (p_to   is null or e.entry_date <= p_to)
     and (private.can('view_cash') or private.can('can_manage_cash'))
   group by 1
   order by 1
$$;

comment on function public.cash_flow_monthly(p_from date, p_to date) is
  'Приход/расход кассы по месяцам за период (месяц = первое число). Операции раньше opening_date исключены, кроме помеченных include_before_opening. Пустые месяцы не возвращаются — дорисовывает клиент. Право view_cash ИЛИ can_manage_cash внутри DEFINER. 2026-08-03 (0017); флаг 2026-08-04 (0019).';

-- Переключатель флага. SECURITY DEFINER, потому что отсечка бьёт и по
-- АВТО-строкам (приход платежа, розхід расхода), а их RLS на UPDATE не отдаёт
-- вовсе — и правильно делает: руками их править нельзя. Здесь меняется ровно
-- одна служебная колонка, суммы и даты остаются за своей сущностью.
create function public.cash_entry_set_included(
    p_entry_id uuid,
    p_value boolean
) returns boolean
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_rows int;
begin
  if not private.can('can_manage_cash'::text) then
    raise exception 'cash_entry_set_included: can_manage_cash required'
      using errcode = '42501';
  end if;

  update public.cash_entries
     set include_before_opening = coalesce(p_value, false)
   where id = p_entry_id;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant all on function public.cash_entry_set_included(uuid, boolean) to authenticated;

comment on function public.cash_entry_set_included(p_entry_id uuid, p_value boolean) is
  'Включить/исключить операцию кассы в обороты вопреки дате начального остатка счёта (cash_entries.include_before_opening). Право can_manage_cash проверяется внутри DEFINER: флаг нужен и для авто-строк, которым RLS UPDATE не даёт. Возвращает true, если строка найдена. 2026-08-04 (0019).';

-- ── C. Флаг переживает пересинхронизацию авто-строки ────────────────────────
-- Правка платежа/расхода пересоздаёт строку кассы (delete + insert). Без
-- переноса флага сделанное владельцем исключение молча слетало бы при любой
-- правке комментария — и деньги снова выпадали бы из оборотов.
create or replace function private.cash_sync_on_payment() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_desc    text;
  v_incl    boolean := false;
begin
  -- РЕЗОЛВИМ счёт ПЕРВЫМ — и только потом трогаем cash_entries. Иначе на UPDATE,
  -- если платёж отредактировали в метод без счёта (method=NULL и нет дефолтного счёта),
  -- мы бы удалили прежнюю авто-строку и НЕ создали новую → молчаливая потеря прихода
  -- (находка адвер-ревью HIGH). Резолв до DELETE гарантирует: строку удаляем, только
  -- если есть куда переложить приход.
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));
  if v_account is null then
    -- Касс нет / метод не лёг ни на один счёт. INSERT — тихо пропускаем (платёж
    -- проходит, DoD: триггер не падает). UPDATE — НЕ удаляем прежнюю строку (сохраняем
    -- ранее зафиксированный приход), просто выходим.
    return null;
  end if;

  -- Счёт известен. На UPDATE пересоздаём строку (сумма/дата/счёт могли смениться),
  -- унося с собой ручное «внести в оборот».
  if tg_op = 'UPDATE' then
    select include_before_opening into v_incl
      from public.cash_entries where payment_id = new.id;
    delete from public.cash_entries where payment_id = new.id;
  end if;

  select number_title into v_title from public.cases where id = new.case_id;
  v_desc := coalesce(
    nullif(btrim(new.note), ''),
    'Оплата по справі' || coalesce(': ' || v_title, '')
  );

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id,
     created_by, include_before_opening)
  values
    (v_account, new.paid_at, 'in', new.amount, left(v_desc, 300), new.case_id, new.id,
     new.created_by, coalesce(v_incl, false));

  return null;
end;
$$;

comment on function private.cash_sync_on_payment() is
  'Зеркалит платёж по делу в кассу строкой Надходження. Счёт: payments.account_id, иначе подбор cash_resolve_account(method). Нет счетов → платёж сохраняется, но в оборотку не попадает. На UPDATE пересоздаёт строку, сохраняя include_before_opening. 2026-07-27 (0016); флаг 2026-08-04 (0019).';

create or replace function private.cash_sync_on_expense() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_cat     text;
  v_desc    text;
  v_incl    boolean := false;
begin
  -- 1) Явно выбранный счёт; 2) подбор по виду/по умолчанию (старое поведение).
  -- Счёт резолвим ПЕРВЫМ: на UPDATE не сносим прежнюю строку, если новую
  -- положить некуда — иначе молчаливая потеря расхода из оборотки.
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));
  if v_account is null then
    -- Касс нет вовсе. Расход всё равно сохраняется (триггер не падает).
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select include_before_opening into v_incl
      from public.cash_entries where expense_id = new.id;
    delete from public.cash_entries where expense_id = new.id;
  end if;

  if new.case_id is not null then
    select number_title into v_title from public.cases where id = new.case_id;
  end if;

  select coalesce(nullif(btrim(name), ''), code) into v_cat
    from public.expense_categories where id = new.category_id;

  v_desc := coalesce(v_cat, 'Витрата')
         || coalesce(' · ' || nullif(btrim(new.note), ''), '')
         || coalesce(' — ' || v_title, '');

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, expense_id,
     created_by, include_before_opening)
  values
    (v_account, new.spent_at, 'out', new.amount, left(v_desc, 300), new.case_id, new.id,
     new.created_by, coalesce(v_incl, false));

  return null;
end;
$$;

comment on function private.cash_sync_on_expense() is
  'Зеркалит расход (public.expenses) в кассу строкой Розхід. Счёт: expenses.account_id, иначе подбор cash_resolve_account(method). Дело в описании — только если указано. Нет счетов → расход сохраняется, но в оборотку не попадает. На UPDATE пересоздаёт строку, сохраняя include_before_opening. 2026-07-26 (0015); флаг 2026-08-04 (0019).';

comment on table public.cash_entries is
  'Операции кассы: direction in/out, amount, entry_date, свободное описание. Авто-строки (payment_id NOT NULL — приход по платежу, expense_id NOT NULL — розхід по расходу) создают триггеры и пользователю на UPDATE/DELETE не отдаются (правятся через свою сущность). Операции раньше opening_date счёта в обороты не входят, если не помечены include_before_opening. SELECT — private.can(view_cash) или can(can_manage_cash); запись — can_manage_cash. v2 Этап 7; флаг 2026-08-04 (0019).';

-- ── D. Журнал: расход теперь можно не только завести и снести ───────────────
-- ⚠️ Оба списка действий скопированы ЦЕЛИКОМ из 0014 и дополнены одним
-- значением — иначе прод-миграция падает 23514 на исторических записях.
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
    'expense_category_activated'::text, 'expense_category_deactivated'::text,
    -- удаление счёта кассы (2026-07-26)
    'cash_account_deleted'::text,
    -- статьи расходов: удаление и смена области применения (2026-07-26)
    'expense_category_deleted'::text, 'expense_category_scope_changed'::text,
    -- правка расхода (2026-08-04)
    'expense_updated'::text
  ])));

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
    'expense_category_activated', 'expense_category_deactivated',
    'cash_account_deleted',
    'expense_category_deleted', 'expense_category_scope_changed',
    'expense_updated') then
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
