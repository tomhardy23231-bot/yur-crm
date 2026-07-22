-- ============================================================================
-- 0006_activity_journal.sql — глобальная лента активности «Журнал» (/journal)
--
-- 1) CHECK-констрейнт action: полный ПРЕЖНИЙ allowlist (41) сохранён целиком
--    (гоча 23514 — см. память migration-allowlist) + 18 новых действий:
--    комментарии (added/deleted), скачивание документа, ручная смена
--    completion акта, премия и удаление выплаты/премии, смена собственного
--    пароля, входы в систему (успех/неудача), отпуска, касса (счета+операции),
--    ставки зарплаты, реквизиты компании.
-- 2) Новые entity_type: cash | org | auth | absence — в ленте видит ТОЛЬКО
--    владелец (решение владельца 2026-07-21). ВАЖНО: can_see_all_cases()
--    (scope-all керівник/офис-менеджер) их НЕ открывает — политика SELECT
--    переписана так, что owner-only категории идут отдельной веткой.
-- 3) public.log_activity: расширенный allowlist + гейты записи новых категорий
--    (cash → can_manage_cash; org → owner; auth → только про себя;
--    absence → absence_can_write; user_password_changed — разрешён про себя).
-- ============================================================================

-- ── 1. CHECK: объединённый allowlist (прежние 41 + новые 18) ─────────────────
alter table public.activity_log
  drop constraint activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check check ((action = any (array[
    -- прежний allowlist (0001_baseline) — сохранён целиком
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
    -- новые действия (журнал, 2026-07-21)
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
    'payroll_rates_changed'::text, 'org_requisites_updated'::text
  ])));

-- ── 2. RLS SELECT: owner-only категории отдельной веткой ─────────────────────
-- Прежняя политика открывала всё через can_see_all_cases() — для новых
-- категорий (касса/ставки/входы/отпуска) это открыло бы их scope-all
-- керівникам. Новая структура: owner-only ветка проверяется ПЕРВОЙ.
drop policy activity_log_select_visible on public.activity_log;

create policy activity_log_select_visible on public.activity_log
  for select to authenticated
  using (
    case
      when entity_type = any (array['cash'::text, 'org'::text, 'auth'::text, 'absence'::text])
        then private.is_owner()
      else (
        private.can_see_all_cases()
        or (entity_type = 'case'::text and private.can_see_case(entity_id))
        or (entity_type = 'client'::text and private.can_see_client(entity_id))
        or (entity_type = 'user'::text and private.can('manage_users'::text))
      )
    end
  );

-- ── 3. log_activity: расширенный allowlist + гейты новых категорий ───────────
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
    -- журнал 2026-07-21
    'comment_added', 'comment_deleted',
    'document_downloaded',
    'act_completion_changed',
    'payroll_bonus', 'payroll_tx_deleted',
    'user_password_changed',
    'user_login', 'user_login_failed',
    'absence_created', 'absence_deleted',
    'cash_account_created', 'cash_account_updated',
    'cash_entry_created', 'cash_entry_updated', 'cash_entry_deleted',
    'payroll_rates_changed', 'org_requisites_updated'
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

  if p_entity_type not in (
    'case', 'client', 'user', 'department', 'cash', 'org', 'auth', 'absence'
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
  'Журнал 2026-07-21: +18 действий (комментарии, скачивания, премии/удаления выплат, свой пароль, входы, отпуска, касса, ставки, реквизиты) и entity_type cash|org|auth|absence (в ленте видит только owner). Прежний allowlist сохранён целиком (гоча 23514). SECURITY DEFINER, size cap 8 КБ.';

comment on policy activity_log_select_visible on public.activity_log is
  'Видимость журнала: cash|org|auth|absence — только owner; прежние категории — как раньше (can_see_all_cases / видимость дела / клиента / manage_users).';
