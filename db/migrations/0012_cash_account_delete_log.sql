-- ============================================================================
-- 0012_cash_account_delete_log.sql — действие журнала «удалён счёт кассы».
--
-- ЗАЧЕМ. Владелец попросил (2026-07-26) не только переименовывать счета кассы,
-- но и удалять их. RLS-политика cash_accounts_delete и запрет удаления счёта с
-- операциями (FK cash_entries_account_id_fkey ON DELETE RESTRICT) уже есть с
-- baseline — не хватало только записи в журнал.
--
-- ⚠️ Оба списка действий скопированы ЦЕЛИКОМ из 0009 и дополнены одним
-- значением: писать их от старой базы нельзя, иначе прод-миграция падает с
-- 23514 на исторических записях (грабли задокументированы в CLAUDE.md).
-- ============================================================================

alter table public.activity_log
  drop constraint activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check check ((action = any (array[
    'case_created'::text, 'case_updated'::text, 'case_deleted'::text,
    'stage_corrected'::text, 'case_archived'::text, 'case_restored'::text,
    'case_lost'::text,
    'client_created'::text, 'client_updated'::text, 'client_deleted'::text,
    'document_uploaded'::text, 'document_deleted'::text,
    'payment_created'::text, 'payment_updated'::text, 'payment_deleted'::text,
    'payment_plan_updated'::text,
    'task_created'::text, 'task_updated'::text, 'task_toggled'::text,
    'task_deleted'::text,
    'payroll_paid'::text, 'payroll_reverted'::text, 'payroll_payout'::text,
    'user_created'::text, 'user_role_changed'::text, 'user_deactivated'::text,
    'user_reactivated'::text, 'user_permissions_changed'::text,
    'user_department_changed'::text, 'user_salary_changed'::text,
    'user_password_reset'::text, 'user_email_changed'::text,
    'user_invited'::text, 'user_deleted'::text,
    'comment_edited'::text,
    'department_created'::text, 'department_renamed'::text,
    'department_activated'::text, 'department_deactivated'::text,
    'act_created'::text, 'act_paid'::text, 'act_deleted'::text,
    'comment_added'::text, 'comment_deleted'::text,
    'document_downloaded'::text,
    'act_completion_changed'::text,
    'payroll_bonus'::text, 'payroll_tx_deleted'::text,
    'user_password_changed'::text,
    'user_login'::text, 'user_login_failed'::text,
    'absence_created'::text, 'absence_deleted'::text,
    'cash_account_created'::text, 'cash_account_updated'::text,
    'cash_entry_created'::text, 'cash_entry_updated'::text,
    'cash_entry_deleted'::text,
    'payroll_rates_changed'::text, 'org_requisites_updated'::text,
    'case_type_created'::text, 'case_type_renamed'::text,
    'case_type_activated'::text, 'case_type_deactivated'::text,
    -- расходы по делу и справочник статей (2026-07-24)
    'expense_created'::text, 'expense_deleted'::text,
    'payment_converted_to_expense'::text,
    'expense_category_created'::text, 'expense_category_renamed'::text,
    'expense_category_activated'::text, 'expense_category_deactivated'::text,
    -- удаление счёта кассы (2026-07-26)
    'cash_account_deleted'::text
  ])));

create or replace function public.log_activity(

  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_changes jsonb default null::jsonb
) returns void
  language plpgsql security definer
  set search_path to ''
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
    'user_password_reset', 'user_email_changed', 'user_invited', 'user_deleted',
    'comment_edited',
    'department_created', 'department_renamed',
    'department_activated', 'department_deactivated',
    'act_created', 'act_paid', 'act_deleted',
    'comment_added', 'comment_deleted',
    'document_downloaded',
    'act_completion_changed',
    'payroll_bonus', 'payroll_tx_deleted',
    'user_password_changed',
    'user_login', 'user_login_failed',
    'absence_created', 'absence_deleted',
    'cash_account_created', 'cash_account_updated',
    'cash_entry_created', 'cash_entry_updated', 'cash_entry_deleted',
    'payroll_rates_changed', 'org_requisites_updated',
    'case_type_created', 'case_type_renamed',
    'case_type_activated', 'case_type_deactivated',
    'expense_created', 'expense_deleted', 'payment_converted_to_expense',
    'expense_category_created', 'expense_category_renamed',
    'expense_category_activated', 'expense_category_deactivated',
    'cash_account_deleted') then
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

  if p_entity_type not in (
    'case', 'client', 'user', 'department', 'cash', 'org', 'auth', 'absence',
    'case_type', 'expense_category'
  ) then
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

    -- события по пользователям пишет обладатель manage_users; исключение —
    -- смена СОБСТВЕННОГО пароля (журнал 2026-07-21): каждый пишет про себя.
    if p_entity_type = 'user' and not (
      private.can('manage_users')
      or (p_action = 'user_password_changed' and p_entity_id = v_uid)
    ) then
      return;
    end if;

    -- структуру компании (подразделения) меняет/видит только owner.
    if p_entity_type = 'department' and not private.is_owner() then
      return;
    end if;

    -- справочник типов дел пишут обладатели manage_case_types.
    if p_entity_type = 'case_type' and not private.can('manage_case_types') then
      return;
    end if;

    -- справочник статей расходов пишут обладатели manage_expense_categories.
    if p_entity_type = 'expense_category' and not private.can('manage_expense_categories') then
      return;
    end if;

    -- касса: пишут только менеджеры кассы (право can_manage_cash).
    if p_entity_type = 'cash' and not private.can('can_manage_cash') then
      return;
    end if;

    -- org-события (ставки ЗП, реквизиты) меняет только owner.
    if p_entity_type = 'org' and not private.is_owner() then
      return;
    end if;

    -- auth-события пишутся только про себя (вход/неудачная попытка входа
    -- логируются под учёткой, которой касаются).
    if p_entity_type = 'auth' and not (
      p_entity_id = v_uid
      and p_action in ('user_login', 'user_login_failed')
    ) then
      return;
    end if;

    -- отпуска: кто вправе вносить отсутствие сотруднику (зеркало absences).
    if p_entity_type = 'absence' and not private.absence_can_write(p_entity_id) then
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

comment on function public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb) is
  'Журнал. 2026-07-26 (0012): +действие cash_account_deleted. Прежний allowlist (0009) сохранён ЦЕЛИКОМ — гоча 23514. SECURITY DEFINER, size cap 8 КБ.';
