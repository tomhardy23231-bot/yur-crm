-- Юр CRM — v3 Сессия 7 (Продукт), часть 3: агрегат источников клиентов (дашборд).
--
-- Зачем (PLAN-V3 7.3): clients.source собирается, но нигде не агрегируется —
-- окупаемость каналов привлечения неисчислима. RPC даёт по каждому источнику за
-- период: число клиентов, число их дел и сумму оплат.
--
-- SECURITY INVOKER — RLS вызывающего ОБЯЗАНА работать: у staff это вся компания,
-- у специалиста — только его клиенты/дела (видимость по роли). Поэтому агрегат
-- считается «по своим» автоматически, как и прочие метрики дашборда.
--
-- Период: клиенты по created_at, их дела — по opened_at в том же окне (left join,
-- чтобы клиент без дел в периоде всё равно попал в строку источника). Полуоткрытый
-- интервал [p_from, p_to). Типы: clients.created_at timestamptz, cases.opened_at date
-- (сравнение с date-границами — неявный каст, для помесячного среза достаточно).

create or replace function public.dashboard_sources(p_from date, p_to date)
returns table (source text, clients_count bigint, cases_count bigint, paid_total numeric)
language sql
security invoker
set search_path = ''
as $$
  select coalesce(cl.source, 'other')::text,
         count(distinct cl.id),
         count(distinct c.id),
         coalesce(sum(c.paid_total), 0)
  from public.clients cl
  left join public.cases c on c.client_id = cl.id
       and c.opened_at >= p_from and c.opened_at < p_to
  where cl.created_at >= p_from and cl.created_at < p_to
  group by 1
  order by 4 desc;
$$;

grant execute on function public.dashboard_sources(date, date) to authenticated;

comment on function public.dashboard_sources(date, date) is
  'v3 s7: источники клиентов за период [p_from, p_to): source / клиентов / дел / '
  'оплачено. SECURITY INVOKER — RLS зрителя ограничивает выдачу (staff — всё, '
  'специалист — свои).';
