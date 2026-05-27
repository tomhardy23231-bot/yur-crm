-- Юр CRM — Шлифовка: расширение поиска дел на client.name и tags.
--
-- Контекст: в Шаге 10 поиск был расширен через PostgREST .or() на 3 поля
-- (number_title, opponent, court_case_number). client.name (nested-filter)
-- и tags (cs-оператор / unnest) — отложены, потому что PostgREST не умеет
-- OR'ить условия через embedded resource в одном запросе.
--
-- Решение: SQL-функция search_case_ids, возвращает (id, total). RPC
-- SECURITY INVOKER → RLS на public.cases и public.clients применяются как
-- обычно, эскалации привилегий нет.
--
-- Возврат: пары (case_id, total bigint) — id отсортированы по
-- opened_at DESC, created_at DESC; total продублирован в каждой строке через
-- window-function count() over (). TS-обёртка читает первую строку для total.
--
-- Поля поиска (OR между ними):
--   - cases.number_title ILIKE %q%
--   - cases.opponent ILIKE %q%
--   - cases.court_case_number ILIKE %q%
--   - clients.name ILIKE %q% (LEFT JOIN; RLS на clients тоже применяется)
--   - any tag в cases.tags[] ILIKE %q% (через unnest, substring match)
--
-- Дополнительные фильтры (AND после OR-поиска):
--   - p_stage / p_case_type / p_responsible_id — точное совпадение, NULL = без фильтра.
--
-- Производительность: на Phase 1-объёмах (десятки/сотни дел) приемлемо без
-- индексов. На больших объёмах добавить:
--   - pg_trgm + gin (number_title, opponent, court_case_number, clients.name)
--   - GIN на tags[]

create or replace function public.search_case_ids(
  p_q              text                 default null,
  p_stage          public.case_stage    default null,
  p_case_type      public.case_type     default null,
  p_responsible_id uuid                 default null,
  p_limit          int                  default 20,
  p_offset         int                  default 0
) returns table (id uuid, total bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  with normalized as (
    select
      case when p_q is null or length(trim(p_q)) = 0 then null
           else '%' || trim(p_q) || '%' end as pattern,
      greatest(0, least(coalesce(p_limit, 20), 100))::int as lim,
      greatest(0, coalesce(p_offset, 0))::int as off
  ),
  matching as (
    select c.id, c.opened_at, c.created_at
    from public.cases c
    left join public.clients cl on cl.id = c.client_id
    cross join normalized n
    where (
      n.pattern is null
      or c.number_title ilike n.pattern
      or c.opponent ilike n.pattern
      or c.court_case_number ilike n.pattern
      or cl.name ilike n.pattern
      or exists (
        select 1
        from unnest(c.tags) as tag(value)
        where tag.value ilike n.pattern
      )
    )
    and (p_stage is null or c.stage = p_stage)
    and (p_case_type is null or c.case_type = p_case_type)
    and (p_responsible_id is null or c.responsible_id = p_responsible_id)
  ),
  paged as (
    select
      m.id,
      count(*) over () as total
    from matching m
    order by m.opened_at desc nulls last, m.created_at desc
    limit (select lim from normalized)
    offset (select off from normalized)
  )
  select p.id, p.total::bigint from paged p;
$$;

grant execute on function public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, int, int
) to authenticated;

comment on function public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, int, int
) is
  'Поиск дел по number_title/opponent/court_case_number/client.name/tags. SECURITY INVOKER → RLS применяется. Возвращает (case_id, total).';
