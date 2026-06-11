-- Юр CRM — v3 Сессия 9 (Продукт), часть 2: действие журнала 'payment_plan_updated'.
--
-- Добавляем 'payment_plan_updated' — добавление/удаление позиции графика платежей
-- (lib/payments/actions.ts createPlanItemAction / deletePlanItemAction).
-- entity_type='case', не-delete → гейт case-scope (private.can_see_case), как
-- payment_created/act_created/case_lost.
--
-- ⚠ ГОЧА allowlist (PLAN-V3 шапка/грабля №1, SQLSTATE 23514): пересоздаём CHECK +
-- log_activity ПОВЕРХ 20260611101400_v3_activity_case_lost → ОБЯЗАНЫ сохранить ВЕСЬ
-- прежний allowlist целиком. База мёрджа — 20260611101400 (case_lost + прежние
-- payment_updated/act_deleted/payroll_payout из Сессии 2). Добавляем ОДНО новое
-- действие. entity_type-список НЕ меняем.

alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'case_created', 'case_updated', 'case_deleted', 'stage_corrected',
    'case_archived', 'case_restored', 'case_lost',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_updated', 'payment_deleted',
    'payment_plan_updated',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted', 'payroll_payout',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated',
    'act_created', 'act_paid', 'act_deleted'
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
    'case_created', 'case_updated', 'case_deleted', 'case_lost',
    'case_archived', 'case_restored',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_updated', 'payment_deleted',
    'payment_plan_updated',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted', 'payroll_payout',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated',
    'user_permissions_changed', 'user_department_changed', 'user_salary_changed',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated',
    'act_created', 'act_paid', 'act_deleted'
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
  'v3 Сессия 9: + payment_plan_updated (entity_type case, case-scope гейт). Прежний '
  'allowlist (case/client/document/payment/task/payroll/user/department/comment/act, '
  'в т.ч. case_lost из Сессии 7, payment_updated/act_deleted/payroll_payout из Сессии 2) '
  'сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';
