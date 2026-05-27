-- Юр CRM — Шлифовка фазы 1: hardening public.log_activity (CSO Finding #1).
--
-- Контекст: исходная log_activity (20260527110000) проверяла can_see_case /
-- is_staff, но не ограничивала p_action и p_changes. Любой authenticated мог
-- через rpc(`log_activity`, {...}) записать в activity_log событие с любым
-- action и любым changes, для любого видимого case_id (под своим user_id) —
-- подрыв append-only audit trail из CLAUDE.md §7-7.
--
-- Fix (defence in depth):
--   1) CHECK на public.activity_log.action — отрезает non-allowlisted записи
--      независимо от пути (rpc, service_role, триггер, прямой INSERT).
--      Единственный non-rpc action — 'stage_corrected' (пишет триггер
--      cases_validate_stage_forward), он включён в allowlist таблицы.
--   2) allowlist в самом public.log_activity — silent-skip non-allowed
--      action до INSERT'a (как и остальные проверки видимости). Из rpc
--      'stage_corrected' специально ИСКЛЮЧЁН: триггер пишет его прямым
--      INSERT'ом, а вызов rpc с этим action — попытка подделки и должна
--      молча игнорироваться.
--   3) octet_length(p_changes::text) > 8192 → silent-skip. Защита от спама
--      огромными jsonb-payload'ами.

-- ========================================================================
-- 1) Table-level CHECK constraint
-- ========================================================================

alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted'
  ));

-- ========================================================================
-- 2) Пересоздаём log_activity с allowlist + size cap
-- ========================================================================

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
begin
  if p_entity_type is null or p_entity_id is null or p_action is null then
    return;
  end if;

  -- CSO #1: allowlist actions. 'stage_corrected' специально не входит —
  -- пишется только триггером, прямой rpc с этим action = подделка → silent skip.
  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted'
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

  if p_entity_type not in ('case', 'client') then
    return;
  end if;

  if p_entity_type = 'case' and not private.can_see_case(p_entity_id) then
    return;
  end if;

  if p_entity_type = 'client' and not private.is_staff() then
    return;
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  -- Логирование никогда не должно ломать основную операцию.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Шаг 10 + CSO #1: SECURITY DEFINER, allowlist actions, size cap 8 КБ. Видимость через private.can_see_case / private.is_staff.';
