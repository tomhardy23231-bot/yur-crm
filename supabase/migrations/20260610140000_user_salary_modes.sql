-- Юр CRM — v2 Этап 4: режимы зарплаты на сотруднике (docs/PLAN-V2.md, Этап 4).
--
-- Цель: три режима оплаты труда на уровне сотрудника:
--   • percent        — текущая модель: % от оплат по делам (по умолчанию);
--   • fixed          — фиксированный оклад в месяц, процентная часть = 0;
--   • fixed_percent  — оклад + процентная часть (полная % механика как раньше).
--
-- Процентная механика (payroll_rates + *_rate_override на деле) НЕ меняется —
-- меняется лишь то, ЗАНУЛЯЕТСЯ ли она для режима 'fixed'. Оклад (salary_fixed_amount)
-- в леджер v1 НЕ пишем: он показывается в отчёте справочно за месяц и НЕ входит в
-- накопленный остаток «К выплате» / в механику выплат (решение PLAN-V2; трекинг
-- выплат оклада — Phase 2). Права: оклад/режим меняет owner (любому) либо
-- обладатель manage_users (admin) — сотруднику СВОЕГО подразделения (не себе,
-- не owner/admin). Гард по образцу cases_guard_rate_overrides / visibility_fields.
--
-- ⚠ Приватность: оклад — чувствительные данные. Политика users_select_all даёт
--   любому активному читать строки users целиком, поэтому без защиты salary_*
--   утекли бы каждому сотруднику через прямой PostgREST. RLS колонки скрывать не
--   умеет → защищаем column-level привилегиями (revoke табличного SELECT + grant
--   явного безопасного списка). Оклад читается ТОЛЬКО через SECURITY DEFINER-функции
--   ниже (под private.payroll_user_visible). Все отчётные ЗП-функции — DEFINER.
--
-- Откат: убрать колонки salary_* (и зависимые функции вернуть к телам из
-- 20260610110000 / 20260601110000), восстановить табличный GRANT SELECT на users.
-- Миграция аддитивная: новых таблиц нет, существующие данные не разрушает.

-- ========================================================================
-- 1) users: режим зарплаты и фиксированный оклад
-- ========================================================================
alter table public.users
  add column salary_mode text not null default 'percent'
    constraint users_salary_mode_check
    check (salary_mode in ('percent', 'fixed', 'fixed_percent')),
  add column salary_fixed_amount numeric(14, 2)
    constraint users_salary_fixed_nonneg
    check (salary_fixed_amount is null or salary_fixed_amount >= 0);

-- Консистентность режима и суммы: percent → оклад не задан; fixed/fixed_percent →
-- оклад обязателен. Существующие строки (percent/NULL) проходят проверку.
alter table public.users
  add constraint users_salary_amount_consistent check (
    (salary_mode = 'percent' and salary_fixed_amount is null)
    or (salary_mode in ('fixed', 'fixed_percent') and salary_fixed_amount is not null)
  );

comment on column public.users.salary_mode is
  'Режим зарплаты: percent (% от оплат, дефолт) | fixed (оклад, % зануляется) | '
  'fixed_percent (оклад + %). Меняет owner / admin своего подразделения (БД-гард '
  'users_guard_salary_fields).';
comment on column public.users.salary_fixed_amount is
  'Фиксированный оклад в месяц (₴) для режимов fixed/fixed_percent; NULL для percent. '
  'В v1 показывается в отчёте справочно, в накопленный остаток ЗП не входит.';

-- ========================================================================
-- 2) Приватность salary_*: column-level привилегии вместо табличного SELECT
-- ========================================================================
-- Отзываем табличный SELECT и выдаём явный список БЕЗ salary_*. Новые колонки
-- users в будущих миграциях ОБЯЗАНЫ добавляться в этот grant, иначе станут
-- нечитаемыми под сессией (select их не вернёт). service_role не трогаем (обходит).
revoke select on public.users from authenticated, anon;
grant select (
  id, full_name, email, role, is_active, created_at,
  perm_overrides, language, department_id, position, visibility_scope
) on public.users to authenticated, anon;

-- ========================================================================
-- 3) Право и гард на изменение salary-полей
-- ========================================================================
-- owner — любому; обладатель manage_users (admin) — сотруднику СВОЕГО подразделения,
-- НЕ себе и только управляемых ролей (office_manager/lawyer/expert). admin без
-- подразделения (department_id NULL, переходное правило видимости) зарплату НЕ
-- меняет — это делает owner (Этап 2 отложил скоуп ЗАПИСИ admin'а; здесь — первый
-- департаментно-скоупленный write, строго по спеке «admin — своего подразделения»).
create or replace function private.can_manage_user_salary(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

grant execute on function private.can_manage_user_salary(uuid) to authenticated;

-- Гард по образцу guard_user_visibility_fields: путь service_role (auth.uid() IS
-- NULL — сид/createUserAction) пропускаем, там страж — код. На INSERT новая строка
-- ещё не видна в users → can_manage_user_salary вернёт is_owner() (admin не может
-- задать оклад на вставке через сессию; штатный путь — UPDATE после создания).
create or replace function private.guard_user_salary_fields()
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

create trigger users_guard_salary_fields
  before insert or update of salary_mode, salary_fixed_amount on public.users
  for each row execute function private.guard_user_salary_fields();

-- ========================================================================
-- 4) Отчётные ЗП-функции — учёт режима (у 'fixed' процентная часть = 0)
-- ========================================================================
-- Все функции читают users.salary_mode → должны быть SECURITY DEFINER (под column-
-- level revoke сессия колонку не видит). payroll_by_specialist/*_summary/*_cases
-- уже DEFINER (20260610110000); case_payroll был INVOKER → переводим в DEFINER с
-- явным гейтом private.case_visible (раньше его заменяла RLS на cases).

-- 4.1 case_payroll(case_id) — начисление по делу. Для роли в режиме 'fixed' её
--     процент и сумма = 0 (оклад на карточке дела не считаем).
drop function if exists public.case_payroll(uuid);
create function public.case_payroll(p_case_id uuid)
returns table (
  category       public.case_category,
  lawyer_percent numeric,
  lawyer_amount  numeric,
  expert_percent numeric,
  expert_amount  numeric,
  total          numeric
)
language sql
stable
security definer
set search_path = ''
as $$
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

grant execute on function public.case_payroll(uuid) to authenticated;

comment on function public.case_payroll(uuid) is
  'Начисление % по делу (эффективная ставка = coalesce(override, ставка категории)). '
  'v2 Этап 4: у роли в режиме salary_mode=fixed процент и сумма = 0. SECURITY DEFINER '
  '+ явный гейт private.case_visible.';

-- 4.2 payroll_by_specialist() — сводка начислений по сотрудникам/ролям.
--     Для сотрудника в режиме 'fixed' заработок (%) = 0.
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
    -- v2 Этап 4: режим fixed → процентная часть 0 (оклад в этом отчёте не показываем).
    coalesce(sum(case when u.salary_mode = 'fixed' then 0
                      else round(a.paid_total * a.percent / 100, 2) end), 0) as earned
  from attributed a
  join public.users u on u.id = a.uid
  where private.payroll_user_visible(a.uid)
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;

grant execute on function public.payroll_by_specialist() to authenticated;

-- 4.3 payroll_employee_summary(p_month) — список сотрудников с итогами.
--     + колонки fixed (оклад за месяц) и salary_mode. У 'fixed' процентная часть
--     (earned и в накопленном balance) = 0. В список попадают и сотрудники с
--     окладом без дел/движений (salary_mode <> 'percent').
drop function if exists public.payroll_employee_summary(date);
create function public.payroll_employee_summary(p_month date default null)
returns table (
  user_id     uuid,
  full_name   text,
  earned      numeric,  -- начислено % за месяц (у fixed = 0)
  fixed       numeric,  -- оклад за месяц (fixed/fixed_percent), справочно
  bonus       numeric,  -- премии за месяц
  payout      numeric,  -- выплачено за месяц
  balance     numeric,  -- накопленный остаток «К выплате» (% + премии − выплаты; оклад НЕ входит)
  salary_mode text
)
language sql
stable
security definer
set search_path = ''
as $$
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

grant execute on function public.payroll_employee_summary(date) to authenticated;

comment on function public.payroll_employee_summary(date) is
  'Сводка ЗП по сотрудникам. earned (% за месяц), fixed (оклад за месяц, справочно), '
  'bonus/payout за месяц, balance — накопленный остаток (% + премии − выплаты; оклад '
  'НЕ входит). v2 Этап 4: режим fixed зануляет %, на окладе сотрудник в списке даже '
  'без дел. SECURITY DEFINER + фильтр payroll_user_visible.';

-- 4.4 payroll_employee_cases(p_user_id, p_month) — разбивка по делам.
--     Для сотрудника в режиме 'fixed' процент и заработок по делам = 0.
drop function if exists public.payroll_employee_cases(uuid, date);
create function public.payroll_employee_cases(
  p_user_id uuid,
  p_month   date default null
)
returns table (
  case_id      uuid,
  number_title text,
  stage        public.case_stage,
  role_in_case text,
  paid_total   numeric,
  percent      numeric,
  earned       numeric,
  paid         numeric,
  outstanding  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
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

grant execute on function public.payroll_employee_cases(uuid, date) to authenticated;

comment on function public.payroll_employee_cases(uuid, date) is
  'Разбивка ЗП сотрудника по делам за месяц (NULL = всё время). v2 Этап 4: режим '
  'salary_mode=fixed зануляет процент/заработок по делам. SECURITY DEFINER + фильтр '
  'payroll_user_visible.';

-- 4.5 manage_user_salaries() — режим и оклад для редактора /settings/users.
--     Возвращает строки только тех, кого зритель видит по ЗП (payroll_user_visible);
--     can_edit = право менять (private.can_manage_user_salary). Безопасно отдавать
--     authenticated: обычный сотрудник получит лишь свою строку (can_edit=false).
create or replace function public.manage_user_salaries()
returns table (
  user_id             uuid,
  salary_mode         text,
  salary_fixed_amount numeric,
  can_edit            boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.salary_mode, u.salary_fixed_amount, private.can_manage_user_salary(u.id)
    from public.users u
   where private.payroll_user_visible(u.id)
$$;

grant execute on function public.manage_user_salaries() to authenticated;

-- ========================================================================
-- 5) activity_log: + user_salary_changed (entity_type 'user', manage_users)
-- ========================================================================
-- ⚠ ГОЧА allowlist (PLAN-V2, 23514): пересоздаём CHECK + log_activity ПОВЕРХ
-- 20260610120000 → ОБЯЗАНЫ сохранить ВЕСЬ прежний allowlist. База мёрджа —
-- 20260610120000 (department_* уже включены). Добавляем только user_salary_changed.
alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'case_archived', 'case_restored',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated'
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
    'case_created', 'case_updated', 'case_deleted',
    'case_archived', 'case_restored',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated'
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

    -- события по пользователям видит/пишет только обладатель manage_users.
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
  'v2 Этап 4: + user_salary_changed (entity_type user, manage_users). Прежний allowlist '
  '(case/client/document/payment/task/payroll/user/department/comment) сохранён целиком '
  '(гоча 23514). SECURITY DEFINER, size cap 8 КБ.';
