-- Юр CRM — Управление пользователями и ролями (Задача 4).
--
-- Что закрываем:
--   1) Ступенчатые права (плюшка владельца): owner управляет ВСЕМИ пользователями
--      (в т. ч. owner/admin); admin — ТОЛЬКО не-админскими ролями
--      (office_manager/lawyer/expert) и не может создать/изменить/удалить
--      owner/admin или повысить кого-либо до них. Раньше политики users_* просто
--      звали private.can_manage_users() (= owner ИЛИ admin) → admin мог через
--      прямой запрос повысить себя/другого до owner/admin. Это RLS-дыра.
--   2) Журналирование админ-действий: log_activity получает entity_type='user' и
--      новые action-коды user_created / user_role_changed / user_deactivated /
--      user_reactivated. Видимость для 'user' — только owner/admin.
--
-- RLS НЕ ослабляется — наоборот, ужесточается. Серверные actions (Задача 4)
-- дублируют проверку прав в коде (создание auth-пользователя идёт через
-- service_role в обход RLS, поэтому код — единственный страж на том пути).

-- ========================================================================
-- 1) private.can_manage_target_user(target_role) — ступенчатая проверка
-- ========================================================================
-- owner → любой; admin → только office_manager/lawyer/expert; иначе → нет.
-- is_owner проверяется первым, поэтому admin не пройдёт по ветке owner.

create or replace function private.can_manage_target_user(target_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_owner() then true
    when private.can_manage_users()
      then target_role in ('office_manager', 'lawyer', 'expert')
    else false
  end
$$;

grant execute on function private.can_manage_target_user(public.user_role) to authenticated;

comment on function private.can_manage_target_user(public.user_role) is
  'Ступенчатые права на управление пользователем по его роли (Задача 4): owner — '
  'любой; admin — только не-админские роли (office_manager/lawyer/expert). '
  'Защищает от повышения до owner/admin админом через прямой запрос.';

-- ========================================================================
-- 2) Переписываем политики users INSERT/UPDATE/DELETE на ступенчатую проверку
-- ========================================================================
-- Для UPDATE: USING смотрит СТАРУЮ строку (можно ли трогать текущую роль),
-- WITH CHECK — НОВУЮ (нельзя повысить до owner/admin админом). Оба условия
-- через тот же хелпер → admin режется в обе стороны.

drop policy if exists users_insert_managers on public.users;
create policy users_insert_managed_roles
  on public.users
  for insert
  to authenticated
  with check (private.can_manage_target_user(role));

drop policy if exists users_update_managers on public.users;
create policy users_update_managed_roles
  on public.users
  for update
  to authenticated
  using      (private.can_manage_target_user(role))
  with check (private.can_manage_target_user(role));

drop policy if exists users_delete_managers on public.users;
create policy users_delete_managed_roles
  on public.users
  for delete
  to authenticated
  using (private.can_manage_target_user(role));

-- ========================================================================
-- 3) activity_log: разрешаем user-* события
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
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated'
  ));

-- log_activity переопределяем на базе версии из 20260530120000_fix_revert_merge
-- (сохраняем MED#7-ветку для *_deleted и payroll-actions), добавляя:
--   - в allowlist user_created/user_role_changed/user_deactivated/user_reactivated;
--   - entity_type='user' с видимостью «только owner/admin» (can_manage_users).
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

  -- allowlist actions (+payroll_* — Задача 5, +user_* — Задача 4).
  -- 'stage_corrected' исключён — пишется только триггером (rpc = подделка).
  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'payroll_paid', 'payroll_reverted',
    'user_created', 'user_role_changed', 'user_deactivated', 'user_reactivated'
  ) then
    return;
  end if;

  -- size cap на changes.
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

  -- MED#7: для уничтожающих действий entity уже не существует — can_see_case
  -- вернёт false. Разрешаем запись для is_staff.
  v_is_delete_action := p_action in ('case_deleted', 'client_deleted');

  if v_is_delete_action then
    if not private.is_staff() then
      return;
    end if;
  else
    if p_entity_type = 'case' and not private.can_see_case(p_entity_id) then
      return;
    end if;

    if p_entity_type = 'client' and not private.is_staff() then
      return;
    end if;

    -- Задача 4: события по пользователям видит/пишет только owner/admin.
    if p_entity_type = 'user' and not private.can_manage_users() then
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
  'Шаг 10 + CSO #1 + MED#7 + Задача 5 + Задача 4: SECURITY DEFINER, allowlist '
  '(+payroll_*, +user_*), size cap 8 КБ, is_staff bypass для *_deleted, '
  'entity_type user видит только owner/admin (can_manage_users).';
