-- Юр CRM — Архив дел (вкладка «Архив» + действие «В архив»/«Восстановить»).
--
-- Бизнес-решение (согласовано с заказчиком 2026-06-07):
--   • Архивирование — ОТДЕЛЬНОЕ от воронки действие. Завершённое дело остаётся в
--     активном списке, пока его явно не отправят в архив; «Восстановить» возвращает.
--   • Архивировать можно ТОЛЬКО завершённое дело (stage='closed') → у архива всегда
--     есть дата закрытия (closed_at), по которой работает фильтр на вкладке «Архив».
--   • Архивируют/восстанавливают ТОЛЬКО staff (owner/admin/office_manager). Юрист и
--     Експерт архив видят (RLS как у обычных дел), но менять не могут.
--
-- Что делает миграция:
--   1) колонки cases.archived_at (timestamptz, NULL = активно) и archived_by;
--   2) CHECK cases_archived_requires_closed: archived_at можно ставить только у closed;
--   3) частичные индексы под список архива и фильтр по дате закрытия;
--   4) guard-триггер private.cases_guard_archive: смену archived_* пускает только
--      staff, требует stage='closed', archived_by проставляет сам из active_uid();
--   5) allowlist activity_log: + 'case_archived' / 'case_restored' (таблица-CHECK +
--      функция log_activity) — пересоздаём ПОВЕРХ актуальной версии 20260606140000,
--      сохраняя весь прежний allowlist (иначе прод-строки нарушат CHECK → 23514);
--   6) RPC search_case_ids: + p_archived / p_closed_from / p_closed_to, чтобы поиск
--      и пагинация были консистентны с вкладкой и фильтром по дате.

-- ========================================================================
-- 1) Колонки archived_at / archived_by
-- ========================================================================
alter table public.cases
  add column if not exists archived_at timestamptz;

alter table public.cases
  add column if not exists archived_by uuid references public.users(id) on delete set null;

comment on column public.cases.archived_at is
  'Время отправки дела в архив (NULL — дело активно, в архиве не лежит).';
comment on column public.cases.archived_by is
  'Кто отправил дело в архив (NULL — не в архиве). Проставляется триггером из active_uid().';

-- ========================================================================
-- 2) CHECK: в архив только завершённое дело.
--    Гарантирует, что у любого архивного дела есть closed_at (он синхронен
--    stage='closed' через cases_closed_consistency) → фильтр по дате закрытия
--    на вкладке «Архив» всегда осмыслен. Откат этапа архивного дела заблокируется
--    этим CHECK — поэтому UI требует сперва «Восстановить», потом менять этап.
-- ========================================================================
alter table public.cases
  drop constraint if exists cases_archived_requires_closed;

alter table public.cases
  add constraint cases_archived_requires_closed
  check (archived_at is null or stage = 'closed');

-- ========================================================================
-- 3) Индексы под вкладку «Архив» и фильтр по дате закрытия.
--    Частичные (where archived_at is not null) — архив обычно небольшая доля.
-- ========================================================================
create index if not exists cases_archived_at_idx
  on public.cases (archived_at desc)
  where archived_at is not null;

create index if not exists cases_archive_closed_at_idx
  on public.cases (closed_at desc)
  where archived_at is not null;

-- ========================================================================
-- 4) Guard-триггер: смену archived_* пускаем только staff; требуем stage='closed';
--    archived_by выставляем сами (нельзя подделать). Зеркало подхода
--    private.cases_guard_rate_overrides (20260529120000).
-- ========================================================================
create or replace function private.cases_guard_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Новые дела архивными не создаются (stage по умолчанию new_request), но на
    -- всякий случай: archived_at при вставке → только staff и только у closed.
    if new.archived_at is not null then
      if not private.is_staff() then
        raise exception 'only staff may archive cases'
          using errcode = 'P0001', hint = 'archive_forbidden';
      end if;
      if new.stage <> 'closed' then
        raise exception 'only closed cases may be archived'
          using errcode = 'P0001', hint = 'archive_requires_closed';
      end if;
      new.archived_by := private.active_uid();
    else
      new.archived_by := null;
    end if;
    return new;
  end if;

  -- UPDATE: триггер навешен `of archived_at, archived_by`, т.е. срабатывает только
  -- когда эти колонки в SET. Реагируем лишь на фактическое изменение.
  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    if not private.is_staff() then
      raise exception 'only staff may archive cases'
        using errcode = 'P0001', hint = 'archive_forbidden';
    end if;
    if new.archived_at is not null then
      if new.stage <> 'closed' then
        raise exception 'only closed cases may be archived'
          using errcode = 'P0001', hint = 'archive_requires_closed';
      end if;
      new.archived_by := private.active_uid();
    else
      new.archived_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cases_guard_archive on public.cases;

create trigger cases_guard_archive
  before insert or update of archived_at, archived_by on public.cases
  for each row execute function private.cases_guard_archive();

-- ========================================================================
-- 5) Allowlist activity_log: + 'case_archived' / 'case_restored'.
--    ПЕРЕСОЗДАЁМ ПОВЕРХ 20260606140000 — сохраняем весь прежний allowlist
--    (payroll_*/user_*/comment_edited) и логику функции. 'stage_corrected'
--    остаётся в табличном CHECK, но НЕ во внутреннем allowlist функции.
-- ========================================================================
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
    'user_permissions_changed',
    'comment_edited'
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
    'user_permissions_changed',
    'comment_edited'
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

  if p_entity_type not in ('case', 'client', 'user') then
    return;
  end if;

  v_is_delete_action := p_action in ('case_deleted', 'client_deleted');

  if v_is_delete_action then
    -- Сущность уже удалена → can_see_case вернёт false. Пишем лог, если у актора
    -- есть соответствующее право удаления (delete_* можно выдать персонально).
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
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  -- Логирование никогда не должно ломать основную операцию.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'permission_overrides + comment_edited + case_archived/case_restored: SECURITY DEFINER, '
  'allowlist (+payroll_*/user_*/comment_edited/case_archived/case_restored), size cap 8 КБ. '
  'entity_type user видит/пишет только обладатель manage_users.';

-- ========================================================================
-- 6) RPC search_case_ids: + p_archived / p_closed_from / p_closed_to.
--    Поиск (q) идёт через эту RPC; вкладка «Архив» и фильтр по дате закрытия
--    должны действовать и в режиме поиска (иначе total/пагинация разъедутся).
--    DROP+CREATE: меняется signature. Остальная логика — как в 20260531120000.
-- ========================================================================
drop function if exists public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, public.case_category, uuid, uuid, int, int, text, text
);

create or replace function public.search_case_ids(
  p_q              text                  default null,
  p_stage          public.case_stage     default null,
  p_case_type      public.case_type      default null,
  p_responsible_id uuid                  default null,
  p_category       public.case_category  default null,
  p_lawyer_id      uuid                  default null,
  p_client_id      uuid                  default null,
  p_archived       boolean               default null,
  p_closed_from    date                  default null,
  p_closed_to      date                  default null,
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
    and (p_lawyer_id is null or c.lawyer_id = p_lawyer_id)
    and (p_client_id is null or c.client_id = p_client_id)
    -- Архив: p_archived true → только архивные; false → только активные; null → все.
    and (
      p_archived is null
      or (p_archived is true and c.archived_at is not null)
      or (p_archived is false and c.archived_at is null)
    )
    and (p_closed_from is null or c.closed_at >= p_closed_from)
    and (p_closed_to is null or c.closed_at <= p_closed_to)
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
  text, public.case_stage, public.case_type, uuid, public.case_category, uuid, uuid,
  boolean, date, date, int, int, text, text
) to authenticated;

comment on function public.search_case_ids(
  text, public.case_stage, public.case_type, uuid, public.case_category, uuid, uuid,
  boolean, date, date, int, int, text, text
) is
  'Поиск дел по number_title/opponent/court_case_number/client.name/tags. SECURITY INVOKER → RLS. '
  'Возвращает (case_id, total). Фильтры: p_stage/p_case_type/p_responsible_id/p_category/p_lawyer_id/'
  'p_client_id + p_archived (вкладка «Архив») + p_closed_from/p_closed_to (дата закрытия). '
  'p_sort whitelist: number_title|opened_at|contract_sum|debt (default opened_at desc).';
