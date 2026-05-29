-- Юр CRM — Внешнее ревью MED#7.
--
-- MED#4 (is_active в валидаторе ответственного) свёрнут в базовую миграцию
-- 20260526100100_core_tables.sql: private.cases_validate_assignees() уже
-- проверяет existence + is_active для lawyer_id и responsible_id. Отдельный
-- блок здесь больше не нужен (старая функция cases_validate_responsible удалена).
--
-- MED#7: log_activity для p_action='case_deleted' / 'client_deleted' падает
-- в silent-skip ветке `can_see_case(p_entity_id) = false`, потому что после
-- delete строки case/client уже нет → политики видимости возвращают false.
-- Поэтому deleteCaseAction исторически писал лог ДО delete, что приводит
-- к фейковым 'case_deleted' записям при FK-violation (23503 — есть документы
-- или платежи): дело остаётся, а в журнале «удалено».
--
-- Fix: для actions '*_deleted' (entity-уничтожение) пропускаем can_see_case,
-- но требуем is_staff() — потому что delete по политикам разрешён только
-- owner/admin (и теперь явно дублируется requireRole в server-actions).
-- Это позволяет переписать deleteCaseAction на log-AFTER-delete: при FK
-- ошибке лог не появится; при успехе — появится через стандартный path.
--
-- payment_deleted / document_deleted продолжают работать как раньше —
-- родительский case всё ещё существует, can_see_case=true; новая ветка для
-- них просто не активируется (action не в списке is_staff-only-deleted).

-- ========================================================================
-- MED#7 — log_activity: пропуск can_see_case для *_deleted (is_staff-only)
-- ========================================================================
-- Полностью переписываем функцию (изменяется логика ветвления, CREATE OR
-- REPLACE достаточно — сигнатура не меняется).

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

  -- CSO #1: allowlist actions. 'stage_corrected' исключён — пишется только триггером.
  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted'
  ) then
    return;
  end if;

  -- CSO #1: size cap на changes.
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

  -- MED#7: для уничтожающих действий entity уже не существует — can_see_case
  -- вернёт false. Разрешаем запись для is_staff (RLS DELETE на cases/clients
  -- уже is_staff-only, и server-actions дублируют requireRole). Без этой
  -- ветки deleteCaseAction вынужден логировать ДО delete, что даёт фейковую
  -- 'case_deleted' запись при FK violation.
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
  end if;

  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (p_entity_type, p_entity_id, v_uid, p_action, p_changes);

exception when others then
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Шаг 10 + CSO #1 + MED#7: SECURITY DEFINER, allowlist, size cap, is_staff bypass для *_deleted (entity уже удалена).';
