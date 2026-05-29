-- Юр CRM — Внешнее ревью HIGH#3: корректная сортировка поиска дел.
--
-- Проблема: search_case_ids всегда сортирует по opened_at desc + LIMIT/OFFSET.
-- listCases поверх этого делал клиентскую sortItemsByColumn по уже-спагинированным
-- 20 рядам — на странице 1 для «contract_sum desc» пользователь видел не топ-20
-- по сумме, а первые 20 по opened_at, отсортированные между собой по сумме.
--
-- Решение: добавляем p_sort + p_dir и применяем сортировку в SQL ДО LIMIT/OFFSET.
-- Whitelist на стороне TS (CASES_SORTABLE_COLUMNS), но валидируем и здесь
-- через CASE — неизвестные имена молча игнорируются (fallback на opened_at desc).
--
-- DROP+CREATE: signature меняется (новые параметры с дефолтами в конце),
-- CREATE OR REPLACE этого не позволяет.
--
-- Sortable: number_title, opened_at, contract_sum, debt (то же, что
-- CASES_SORTABLE_COLUMNS в src/lib/cases/queries.ts).
-- Tie-breaker: id desc — стабильный порядок при равных значениях
-- (тот же подход, что в без-q пути listCases).

drop function if exists public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, int, int
);

create or replace function public.search_case_ids(
  p_q              text                  default null,
  p_stage          public.case_stage     default null,
  p_case_type      public.case_type      default null,
  p_responsible_id uuid                  default null,
  p_category       public.case_category  default null,
  p_limit          int                   default 20,
  p_offset         int                   default 0,
  p_sort           text                  default 'opened_at',
  p_dir            text                  default 'desc'
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
      greatest(0, coalesce(p_offset, 0))::int as off,
      lower(coalesce(p_sort, 'opened_at')) as sort_col,
      case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as sort_dir
  ),
  matching as (
    select c.id, c.number_title, c.opened_at, c.contract_sum, c.debt, c.created_at
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
    and (p_category is null or c.category = p_category)
  ),
  paged as (
    select
      m.id,
      count(*) over () as total
    from matching m
    cross join normalized n
    order by
      -- number_title
      case when n.sort_col = 'number_title' and n.sort_dir = 'asc'  then m.number_title end asc  nulls last,
      case when n.sort_col = 'number_title' and n.sort_dir = 'desc' then m.number_title end desc nulls last,
      -- contract_sum
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'asc'  then m.contract_sum end asc  nulls last,
      case when n.sort_col = 'contract_sum' and n.sort_dir = 'desc' then m.contract_sum end desc nulls last,
      -- debt
      case when n.sort_col = 'debt'         and n.sort_dir = 'asc'  then m.debt end         asc  nulls last,
      case when n.sort_col = 'debt'         and n.sort_dir = 'desc' then m.debt end         desc nulls last,
      -- opened_at (default + fallback для неизвестных sort_col)
      case when (n.sort_col not in ('number_title','contract_sum','debt') or n.sort_col = 'opened_at')
                and n.sort_dir = 'asc'  then m.opened_at end asc  nulls last,
      case when (n.sort_col not in ('number_title','contract_sum','debt') or n.sort_col = 'opened_at')
                and n.sort_dir = 'desc' then m.opened_at end desc nulls last,
      m.created_at desc,
      m.id desc
    limit (select lim from normalized)
    offset (select off from normalized)
  )
  select p.id, p.total::bigint from paged p;
$$;

grant execute on function public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, public.case_category, int, int, text, text
) to authenticated;

comment on function public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, public.case_category, int, int, text, text
) is
  'Поиск дел по number_title/opponent/court_case_number/client.name/tags. SECURITY INVOKER → RLS применяется. Возвращает (case_id, total). Фильтры: p_stage/p_case_type/p_responsible_id/p_category. p_sort whitelist: number_title|opened_at|contract_sum|debt (default opened_at desc).';
