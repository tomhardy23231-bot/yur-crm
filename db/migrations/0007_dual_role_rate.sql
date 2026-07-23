-- ============================================================================
-- 0007_dual_role_rate.sql — одиночное начисление ЗП при совмещении ролей
-- (lawyer_id = responsible_id: один сотрудник — и юрист, и Експерт дела).
--
-- Проблема (замечание клиента 2026-07-23): расчётные функции считали роли
-- независимыми union-ветками → человек в двух ролях получал ДВА полных
-- процента (например, 10% юриста + 10% Експерта = 20% от оплат). Личный
-- дашборд при этом уже считал одинарно — отчёты расходились.
--
-- Решение:
-- 1) cases.dual_rate_override numeric(5,2) NULL — ставка «при совмещении»,
--    назначается вручную (owner/admin: модалка на карточке дела / форма).
--    NULL (не назначена) → БОЛЬШАЯ из двух эффективных ставок ролей
--    (дефолты категорий равны, так что обычно это просто «одна ставка»).
--    Если роли снова разъехались — поле игнорируется расчётом.
-- 2) Гард прав cases_guard_rate_overrides расширен на новое поле
--    (менять может только обладатель cap edit_rate_overrides).
-- 3) Пересобраны все расчётные функции: case_payroll (карточка дела),
--    payroll_employee_summary / payroll_employee_cases (отчёт ЗП),
--    payroll_by_specialist (сводка), dashboard_stock_months (фонд дашборда).
--    Совмещённое дело идёт ОДНОЙ строкой role_in_case='dual'; выплаченные
--    аллокации ОБЕИХ ролей такого дела склеиваются в эту строку (исторические
--    выплаты по роли 'expert' не теряются). Режим salary_mode='fixed'
--    зануляет процент, как раньше. Новые аллокации выплат для 'dual'-строк
--    приложение пишет с role_in_case='lawyer' (CHECK payout_allocations
--    не меняется).
-- ============================================================================

-- ── 1. Колонка cases.dual_rate_override ─────────────────────────────────────

alter table public.cases
  add column dual_rate_override numeric(5,2),
  add constraint cases_dual_rate_override_check
    check (dual_rate_override >= 0 and dual_rate_override <= 100);

comment on column public.cases.dual_rate_override is
  'Единый % зарплаты, когда юрист и Експерт дела — один человек (lawyer_id = responsible_id). NULL → greatest(эффективная ставка юриста, эффективная ставка Експерта). При разных людях в ролях игнорируется. Менять может только owner/admin (edit_rate_overrides).';

-- ── 2. Гард прав: edit_rate_overrides покрывает и dual-поле ─────────────────

create or replace function private.cases_guard_rate_overrides() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if tg_op = 'INSERT' then
    if (new.lawyer_rate_override is not null or new.expert_rate_override is not null
        or new.dual_rate_override is not null)
       and not private.can('edit_rate_overrides') then
      raise exception 'only users with edit_rate_overrides may set per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.lawyer_rate_override is distinct from old.lawyer_rate_override
        or new.expert_rate_override is distinct from old.expert_rate_override
        or new.dual_rate_override is distinct from old.dual_rate_override)
       and not private.can('edit_rate_overrides') then
      raise exception 'only users with edit_rate_overrides may change per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  end if;
  return new;
end;
$$;

-- Триггер перечисляет колонки (UPDATE OF) — пересоздаём с dual-полем.
drop trigger cases_guard_rate_overrides on public.cases;
create trigger cases_guard_rate_overrides
  before insert or update of lawyer_rate_override, expert_rate_override, dual_rate_override
  on public.cases
  for each row execute function private.cases_guard_rate_overrides();

-- ── 3. case_payroll: карточка дела ──────────────────────────────────────────
-- При совмещении вся сумма идёт в lawyer_*-полях (dual-ставка), expert_* = 0;
-- сигнатура не меняется — UI сам знает про совмещение (lawyer_id = responsible_id).

create or replace function public.case_payroll(p_case_id uuid)
  returns table(category public.case_category, lawyer_percent numeric, lawyer_amount numeric, expert_percent numeric, expert_amount numeric, total numeric)
    language sql stable security definer
    set search_path to ''
    as $$
  select
    c.category,
    case when c.lawyer_id = c.responsible_id then eff.dual_pct
         else eff.lawyer_pct end as lawyer_percent,
    case when c.lawyer_id = c.responsible_id then round(c.paid_total * eff.dual_pct / 100, 2)
         else round(c.paid_total * eff.lawyer_pct / 100, 2) end as lawyer_amount,
    case when c.lawyer_id = c.responsible_id then 0
         else eff.expert_pct end as expert_percent,
    case when c.lawyer_id = c.responsible_id then 0
         else round(c.paid_total * eff.expert_pct / 100, 2) end as expert_amount,
    case when c.lawyer_id = c.responsible_id then round(c.paid_total * eff.dual_pct / 100, 2)
         else round(c.paid_total * eff.lawyer_pct / 100, 2)
            + round(c.paid_total * eff.expert_pct / 100, 2) end as total
  from public.cases c
  join public.payroll_rates r on r.category = c.category
  left join public.users lu on lu.id = c.lawyer_id
  left join public.users eu on eu.id = c.responsible_id
  cross join lateral (
    select
      case when lu.salary_mode = 'fixed' then 0
           else coalesce(c.lawyer_rate_override, r.lawyer_percent) end as lawyer_pct,
      case when eu.salary_mode = 'fixed' then 0
           else coalesce(c.expert_rate_override, r.expert_percent) end as expert_pct,
      case when lu.salary_mode = 'fixed' then 0
           else coalesce(c.dual_rate_override,
                         greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent),
                                  coalesce(c.expert_rate_override, r.expert_percent))) end as dual_pct
  ) eff
  where c.id = p_case_id
    and private.case_visible(c.lawyer_id, c.responsible_id);
$$;

comment on function public.case_payroll(p_case_id uuid) is
  'Начисление % по делу (эффективная ставка = coalesce(override, ставка категории)). v2 Этап 4: у роли в режиме salary_mode=fixed процент и сумма = 0. 0007: при совмещении ролей (lawyer_id=responsible_id) — ОДНО начисление по dual-ставке (coalesce(dual_rate_override, greatest(ставок ролей))) в lawyer_*-полях, expert_* = 0. SECURITY DEFINER + явный гейт private.case_visible.';

-- ── 4. payroll_by_specialist: сводка по сотрудникам×ролям ───────────────────

create or replace function public.payroll_by_specialist()
  returns table(user_id uuid, full_name text, role_in_case text, case_count bigint, paid_base numeric, earned numeric)
    language sql stable security definer
    set search_path to ''
    as $$
  with attributed as (
    select
      c.lawyer_id                                       as uid,
      case when c.lawyer_id = c.responsible_id
           then 'dual' else 'lawyer' end::text          as role_in_case,
      c.paid_total,
      case when c.lawyer_id = c.responsible_id
           then coalesce(c.dual_rate_override,
                         greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent),
                                  coalesce(c.expert_rate_override, r.expert_percent)))
           else coalesce(c.lawyer_rate_override, r.lawyer_percent) end as percent
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
    where c.responsible_id <> c.lawyer_id
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

comment on function public.payroll_by_specialist() is
  'Сводка начислений по сотрудникам с эффективной per-role ставкой. SECURITY DEFINER + явный фильтр зрителя (Задача 1). 0007: совмещённые дела (lawyer_id=responsible_id) — одной строкой role_in_case=''dual'' по dual-ставке, expert-ветка их пропускает (двойное начисление устранено).';

-- ── 5. payroll_employee_cases: разбивка ЗП сотрудника по делам ──────────────

create or replace function public.payroll_employee_cases(p_user_id uuid, p_month date default null::date)
  returns table(case_id uuid, number_title text, stage public.case_stage, role_in_case text, paid_total numeric, percent numeric, earned numeric, paid numeric, outstanding numeric)
    language sql stable security definer
    set search_path to ''
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
    select c.id as case_id, c.number_title, c.stage,
           case when c.lawyer_id = c.responsible_id
                then 'dual' else 'lawyer' end::text as role_in_case,
           case when p_month is null then c.paid_total else coalesce(mp.paid_month, 0) end as base,
           case when c.lawyer_id = c.responsible_id
                then coalesce(c.dual_rate_override,
                              greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent),
                                       coalesce(c.expert_rate_override, r.expert_percent)))
                else coalesce(c.lawyer_rate_override, r.lawyer_percent) end as percent
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
       and c.responsible_id <> c.lawyer_id
  ),
  -- Выплаченные аллокации: у совмещённого дела строки обеих ролей склеиваются
  -- в 'dual' (исторические выплаты по 'expert' не теряются).
  alloc as (
    select a.case_id,
           case when ca.lawyer_id = ca.responsible_id
                then 'dual' else a.role_in_case end as role_in_case,
           coalesce(sum(a.amount), 0) as paid
      from public.payout_allocations a
      join public.payroll_transactions t on t.id = a.transaction_id
      join public.cases ca on ca.id = a.case_id
     where t.user_id = p_user_id
       and (p_month is null
            or (t.occurred_on >= p_month and t.occurred_on < (p_month + interval '1 month')))
     group by 1, 2
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

comment on function public.payroll_employee_cases(p_user_id uuid, p_month date) is
  'Разбивка ЗП сотрудника по делам за месяц (NULL = всё время). v2 Этап 4: режим salary_mode=fixed зануляет процент/заработок. 0007: совмещённое дело (lawyer_id=responsible_id) — одной строкой role_in_case=''dual'' по dual-ставке; аллокации выплат обеих ролей склеены в неё. SECURITY DEFINER + фильтр payroll_user_visible.';

-- ── 6. payroll_employee_summary: сводка отчёта ЗП ───────────────────────────

create or replace function public.payroll_employee_summary(p_month date default null::date)
  returns table(user_id uuid, full_name text, earned numeric, fixed numeric, bonus numeric, payout numeric, balance numeric, salary_mode text)
    language sql stable security definer
    set search_path to ''
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
  -- 0007: при совмещении ролей юрист-ветка несёт dual-ставку, Експерт-ветка
  -- совмещённые дела пропускает.
  assigned_month as (
    select c.lawyer_id as uid,
           case when lu.salary_mode = 'fixed' then 0
                when c.lawyer_id = c.responsible_id
                then round(coalesce(mp.paid_month, 0) * coalesce(c.dual_rate_override,
                       greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent),
                                coalesce(c.expert_rate_override, r.expert_percent))) / 100, 2)
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
     where c.responsible_id <> c.lawyer_id
  ),
  earned_month as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_month group by uid
  ),
  -- Начислено % за всё время (база накопленного баланса); режим fixed → 0.
  assigned_all as (
    select c.lawyer_id as uid,
           case when lu.salary_mode = 'fixed' then 0
                when c.lawyer_id = c.responsible_id
                then round(c.paid_total * coalesce(c.dual_rate_override,
                       greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent),
                                coalesce(c.expert_rate_override, r.expert_percent))) / 100, 2)
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
     where c.responsible_id <> c.lawyer_id
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

comment on function public.payroll_employee_summary(p_month date) is
  'Сводка ЗП по сотрудникам. earned (% за месяц), fixed (оклад за месяц, справочно), bonus/payout за месяц, balance — накопленный остаток (% + премии − выплаты; оклад НЕ входит). v2 Этап 4: режим fixed зануляет %. 0007: совмещение ролей (lawyer_id=responsible_id) начисляется ОДИН раз по dual-ставке. SECURITY DEFINER + фильтр payroll_user_visible.';

-- ── 7. dashboard_stock_months: серия «зарплата» на дашборде ─────────────────

create or replace function public.dashboard_stock_months(p_from date, p_user_id uuid default null::uuid, p_fixed uuid[] default '{}'::uuid[])
  returns table(month_start date, debt numeric, salary numeric, active_cases bigint)
    language sql
    set search_path to ''
    as $$
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
        -- 0007: совмещение ролей — ОДНА dual-ставка (и для фонда, и для личной серии).
        when c.lawyer_id = c.responsible_id then
          (case when p_user_id is not null and c.lawyer_id <> p_user_id then 0
                when c.lawyer_id = any(p_fixed) then 0
                else coalesce(c.dual_rate_override,
                              greatest(coalesce(c.lawyer_rate_override, r.lawyer_percent, 0),
                                       coalesce(c.expert_rate_override, r.expert_percent, 0))) end)
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
