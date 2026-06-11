-- Юр CRM — v3 Сессия 4: агрегаты дашборда в SQL (docs/PLAN-V3.md, 4.1).
--
-- Зачем: getDashboardAnalytics качал ВСЮ таблицу payments и ВСЕ cases (вдобавок
-- дела тянулись повторно в getDashboardCases). При >1000 строк PostgREST
-- (max_rows=1000) ТИХО режет выдачу → цифры KPI/спарклайнов врут. Переносим
-- агрегацию помесячных серий в SQL: фиксированное число строк на выходе,
-- никакой выкачки истории.
--
-- ВАЖНО: функции SECURITY INVOKER — RLS вызывающего ОБЯЗАНА работать (у каждой
-- роли своя видимость дел/платежей: staff — вся компания/подразделение, юрист —
-- его дела по lawyer_id, Эксперт — по responsible_id). Поэтому права тут НЕ
-- проверяем (как в payroll_*-отчётах invoker), всё решает RLS на cases/payments.
-- salary_mode приватен (column privileges) и под invoker недоступен → список
-- сотрудников-окладников (fixed) приходит ПАРАМЕТРОМ из TS (getFixedSalaryUserIds).
--
-- Семантика 1:1 с прежним TS (lib/dashboard/queries.ts getDashboardAnalytics):
--   • revenue[мес]  — поток: сумма платежей за календарный месяц;
--   • salary[мес]   — НАКОПИТЕЛЬНО на конец месяца: Σ (платёж × эфф.ставка)/100
--                     по всем платежам до конца месяца;
--   • debt[мес]     — запас на конец месяца: Σ max(0, contract_sum − оплачено-до)
--                     по делам, открытым до конца месяца;
--   • active[мес]   — открытые (не закрытые) дела на конец месяца.
-- Эфф.ставка роли = 0 для окладника (fixed), иначе coalesce(override, % категории).
-- Зритель: p_user_id NULL → фонд (юрист%+эксперт%); иначе ставка ЕГО роли в деле.

-- ========================================================================
-- 1) Помесячная выручка (поток) — серия revenue.
-- ========================================================================
create or replace function public.dashboard_payment_months(p_from date)
returns table (month_start date, total numeric)
language sql
security invoker
set search_path = ''
as $$
  select date_trunc('month', p.paid_at)::date as month_start,
         coalesce(sum(p.amount), 0)            as total
  from public.payments p
  where p.paid_at >= p_from
  group by 1
  order by 1;
$$;

grant execute on function public.dashboard_payment_months(date) to authenticated;

-- ========================================================================
-- 2) Помесячные «снимки на конец месяца» — серии debt / salary / active.
-- ========================================================================
-- Возвращает РОВНО 6 строк (по числу окон). p_from — начало самого старого окна
-- (current−5 мес); пороги конца месяца d = p_from + g мес (g = 1..6, исключительно).
create or replace function public.dashboard_stock_months(
  p_from   date,
  p_user_id uuid   default null,
  p_fixed   uuid[] default '{}'
)
returns table (
  month_start  date,
  debt         numeric,
  salary       numeric,
  active_cases bigint
)
language sql
security invoker
set search_path = ''
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

grant execute on function public.dashboard_stock_months(date, uuid, uuid[]) to authenticated;
