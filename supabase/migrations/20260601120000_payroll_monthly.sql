-- Юр CRM — Помесячный режим отчёта по ЗП.
--
-- Правка клиента: отчёт «Финансы и ЗП» должен показываться ПО МЕСЯЦАМ, по умолчанию
-- текущий месяц. Оплаты и начисления не «переваливают» на следующий месяц.
--
-- Привязка к месяцу (согласовано):
--   • Начисление  — по дате платежа (payments.paid_at). Зарплата = % от оплат, поэтому
--                   платёж формирует начисление в том месяце, когда деньги пришли.
--                   Дело с оплатами в разных месяцах делится между ними; открыто/закрыто
--                   значения не имеет — важна дата денег.
--   • Премии/выплаты — по дате движения (payroll_transactions.occurred_on).
--   • «К выплате» (balance) — НАКОПЛЕННЫЙ общий долг за всё время (переходит между
--                   месяцами), считается всегда без фильтра по месяцу.
--
-- Параметр p_month — первый день месяца (YYYY-MM-01). NULL → за всё время (как раньше,
-- обратная совместимость). Список сотрудников остаётся стабильным: показываем всех,
-- кто причастен к ЗП ЗА ВСЁ ВРЕМЯ (иначе долг пропадал бы в «пустой» месяц).
--
-- Видимость не меняется: SECURITY DEFINER + фильтр зрителя (staff — все, сотрудник — себя).

-- Старые сигнатуры заменяем версиями с параметром месяца. Дроп нужен, потому что
-- дефолтный параметр иначе создал бы перегрузку и вызов стал бы неоднозначным.
drop function if exists public.payroll_employee_summary();
drop function if exists public.payroll_employee_cases(uuid);

-- ========================================================================
-- payroll_employee_summary(p_month) — список сотрудников с итогами
-- ========================================================================
-- earned/bonus/payout — ЗА МЕСЯЦ (или всё время при NULL); balance — накопленный.

create or replace function public.payroll_employee_summary(p_month date default null)
returns table (
  user_id   uuid,
  full_name text,
  earned    numeric,  -- начислено за месяц (или всё время при NULL)
  bonus     numeric,  -- премии за месяц
  payout    numeric,  -- выплачено за месяц
  balance   numeric   -- накопленный общий долг (всегда за всё время)
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  -- Оплаты клиента за выбранный месяц по делу.
  month_pay as (
    select p.case_id, sum(p.amount) as paid_month
      from public.payments p
     where p_month is null
        or (p.paid_at >= p_month and p.paid_at < (p_month + interval '1 month'))
     group by p.case_id
  ),
  -- Начислено за месяц по обеим ролям (база = оплачено за месяц).
  assigned_month as (
    select c.lawyer_id as uid,
           round(coalesce(mp.paid_month, 0) * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
    union all
    select c.responsible_id,
           round(coalesce(mp.paid_month, 0) * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
      left join month_pay mp on mp.case_id = c.id
  ),
  earned_month as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_month group by uid
  ),
  -- Начислено за всё время (база накопленного баланса).
  assigned_all as (
    select c.lawyer_id as uid,
           round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
    union all
    select c.responsible_id,
           round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
  ),
  earned_all as (
    select uid, coalesce(sum(amt), 0) as earned from assigned_all group by uid
  ),
  -- Движения за месяц.
  tx_month as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     where p_month is null
        or (occurred_on >= p_month and occurred_on < (p_month + interval '1 month'))
     group by user_id
  ),
  -- Движения за всё время (для накопленного баланса).
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
    coalesce(tm.bonus, 0)  as bonus,
    coalesce(tm.payout, 0) as payout,
    coalesce(ea.earned, 0) + coalesce(ta.bonus, 0) - coalesce(ta.payout, 0) as balance
  from public.users u
  left join earned_month em on em.uid = u.id
  left join earned_all   ea on ea.uid = u.id
  left join tx_month     tm on tm.user_id = u.id
  left join tx_all       ta on ta.user_id = u.id
  where (private.is_staff() or u.id = (select private.active_uid()))
    and (ea.uid is not null or ta.user_id is not null)  -- причастные к ЗП за всё время
  order by balance desc, u.full_name asc;
$$;

grant execute on function public.payroll_employee_summary(date) to authenticated;

comment on function public.payroll_employee_summary(date) is
  'Сводка по сотрудникам для отчёта ЗП. earned/bonus/payout — за месяц p_month (NULL = всё '
  'время); balance — накопленный общий долг (всё время). Список — причастные к ЗП за всё '
  'время. SECURITY DEFINER + фильтр зрителя: staff — все, сотрудник — себя.';

-- ========================================================================
-- payroll_employee_cases(p_user_id, p_month) — разбивка по делам
-- ========================================================================
-- В режиме месяца: paid_total = оплачено за месяц, earned = начислено за месяц,
-- paid = выплаты (аллокации) с occurred_on в этом месяце. NULL → всё время (как раньше).

create or replace function public.payroll_employee_cases(
  p_user_id uuid,
  p_month   date default null
)
returns table (
  case_id      uuid,
  number_title text,
  stage        public.case_stage,
  role_in_case text,
  paid_total   numeric,  -- база: оплачено за месяц (или paid_total за всё время при NULL)
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
  with month_pay as (
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
    b.percent,
    round(b.base * b.percent / 100, 2)                        as earned,
    coalesce(al.paid, 0)                                      as paid,
    round(b.base * b.percent / 100, 2) - coalesce(al.paid, 0) as outstanding
  from buckets b
  left join alloc al
    on al.case_id = b.case_id and al.role_in_case = b.role_in_case
  where private.is_staff() or p_user_id = (select private.active_uid())
  order by outstanding desc, b.number_title asc;
$$;

grant execute on function public.payroll_employee_cases(uuid, date) to authenticated;

comment on function public.payroll_employee_cases(uuid, date) is
  'Разбивка ЗП сотрудника по делам за месяц p_month (NULL = всё время): paid_total (база — '
  'оплачено за месяц), earned, paid (аллокации выплат месяца), outstanding. SECURITY DEFINER '
  '+ фильтр зрителя: staff — любой user_id, иначе только свой.';
