-- Юр CRM — Редактирование комментариев к делу + лог правки.
--
-- Исходная миграция 20260606130000 делала комментарии неизменяемыми (только
-- add/delete) и НЕ логировала их. По запросу добавляем правку:
--   1) updated_at — NULL пока не редактировался, иначе время последней правки;
--   2) UPDATE RLS — автор своей записи ИЛИ owner/admin (зеркало DELETE-политики);
--   3) триггер-страж неизменяемых полей (case_id/author_id/created_at) — чтобы
--      UPDATE не «переехал» комментарий в чужое дело и не подменил автора/время;
--   4) action 'comment_edited' в allowlist activity_log (таблица-CHECK + функция
--      log_activity) — чтобы правку можно было залогировать с from→to через rpc.

-- ========================================================================
-- 1) Колонка updated_at
-- ========================================================================
alter table public.case_comments
  add column if not exists updated_at timestamptz;

comment on column public.case_comments.updated_at is
  'Время последней правки тела комментария (NULL — не редактировался).';

-- ========================================================================
-- 2) UPDATE-политика RLS: автор или owner/admin.
--    WITH CHECK зеркалит USING — менеджер может сохранить чужую запись
--    (author_id остаётся прежним автором, проверку проходит can_manage_users()).
-- ========================================================================
drop policy if exists case_comments_update_author_or_managers
  on public.case_comments;

create policy case_comments_update_author_or_managers
  on public.case_comments
  for update
  to authenticated
  using (
    author_id = (select private.active_uid())
    or private.can_manage_users()
  )
  with check (
    author_id = (select private.active_uid())
    or private.can_manage_users()
  );

-- ========================================================================
-- 3) Страж неизменяемых полей при UPDATE. Меняться может только body/updated_at.
-- ========================================================================
create or replace function private.case_comments_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.case_id <> old.case_id
     or new.author_id <> old.author_id
     or new.created_at <> old.created_at then
    raise exception 'case_comments: case_id/author_id/created_at неизменяемы';
  end if;
  return new;
end;
$$;

drop trigger if exists case_comments_guard_immutable on public.case_comments;

create trigger case_comments_guard_immutable
  before update on public.case_comments
  for each row execute function private.case_comments_guard_immutable();

-- ========================================================================
-- 4) Allowlist activity_log: добавляем 'comment_edited' (таблица + функция).
--    ВАЖНО: пересоздаём ПОВЕРХ актуальной версии из 20260601100000
--    (permission_overrides) — сохраняем payroll_*/user_* действия в табличном
--    CHECK (иначе он отвергнет реальные прод-строки) и логику v_is_delete_action /
--    entity_type='user' в функции (иначе регрессирует журналирование удалений и
--    действий по пользователям). 'stage_corrected' остаётся в табличном CHECK,
--    но НЕ во внутреннем allowlist функции (его пишет только триггер).
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
  'permission_overrides + comment_edited: SECURITY DEFINER, allowlist (+payroll_*/user_*/comment_edited), '
  'size cap 8 КБ. entity_type user видит/пишет только обладатель manage_users.';
