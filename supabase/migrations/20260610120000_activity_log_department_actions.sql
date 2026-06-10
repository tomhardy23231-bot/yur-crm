-- Юр CRM — v2 Этап 3: журнал действий по подразделениям и привязке людей.
--
-- Логируем owner-действия по структуре компании (создание/переименование/
-- (де)активация подразделения) и смену видимости/подразделения сотрудника —
-- это аудит-события того же класса, что смена роли/прав.
--
-- ⚠ ГОЧА allowlist (PLAN-V2 «Подводные камни», 23514): эта миграция
-- ПЕРЕСОЗДАЁТ табличный CHECK activity_log_action_check и функцию log_activity
-- ПОВЕРХ 20260607120000 — поэтому ОБЯЗАНА содержать ВЕСЬ прежний allowlist
-- (case_*/client_*/document_*/payment_*/task_*/payroll_*/user_*/comment_edited)
-- плюс новые действия. Если потерять прежние — db push на прод упадёт 23514,
-- хотя локально на чистой БД всё пройдёт.
--
-- Новые действия:
--   department_created / department_renamed / department_activated /
--   department_deactivated      — entity_type='department' (пишет только owner);
--   user_department_changed     — entity_type='user' (смена department_id и/или
--                                 visibility_scope; видит/пишет обладатель manage_users,
--                                 а менять эти поля и так может только owner — БД-гард).
-- Новый entity_type: 'department'.

-- ========================================================================
-- 1) Табличный CHECK: + department_* и user_department_changed.
--    'stage_corrected' остаётся в табличном CHECK (как в 20260607120000),
--    но НЕ во внутреннем allowlist функции (пишется только триггером).
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
    'user_permissions_changed', 'user_department_changed',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated'
  ));

-- ========================================================================
-- 2) log_activity: + department-actions, entity_type 'department' (owner-gate).
--    База — 20260607120000; меняем только allowlist, entity_type-список и
--    добавляем ветку видимости для 'department'. Остальная логика 1:1.
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
    'user_permissions_changed', 'user_department_changed',
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
  'v2 Этап 3: + department_* (entity_type department, owner-gate) + user_department_changed. '
  'SECURITY DEFINER, allowlist actions/entity_type, size cap 8 КБ. entity_type user — '
  'manage_users; department — owner.';
