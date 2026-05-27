-- Юр CRM — Шаг 10: writer для public.activity_log (CLAUDE.md §5, §7-7).
--
-- Контекст:
--   - activity_log SELECT уже разрешён по матрице (activity_log_select_visible
--     в 20260526100200_rls_policies.sql).
--   - INSERT-политики для user-ролей НЕТ — журнал append-only из
--     триггеров/service_role. Триггер `cases_validate_stage_forward` уже пишет
--     stage_corrected через SECURITY DEFINER.
--   - В Шаге 10 серверные actions (TS) должны логировать мутации. Лезть в
--     service_role из Node-actions — нежелательно (хочется чтобы user_id брался
--     из auth.uid()). Поэтому делаем SQL-функцию SECURITY DEFINER с проверками
--     видимости и grant execute to authenticated.
--
-- Контракт log_activity(entity_type, entity_id, action, changes):
--   - Молча возвращает void в этих случаях:
--       * private.active_uid() = NULL (нет аутентификации/деактивирован);
--       * entity_type не в ('case','client');
--       * entity_type='case' и can_see_case(entity_id) = false (защита от
--         enumeration по чужим case_id);
--       * entity_type='client' и not is_staff() (клиентский журнал — staff-only).
--   - Никогда не пробрасывает исключение наружу — лог не должен ломать основной
--     flow серверного action'a (CLAUDE.md, подводный камень из плана Шага 10).
--
-- Конвенция по entity_type:
--   - case   — все события дела: case_created/case_updated/case_deleted,
--              а ТАКЖЕ дочерние события (document/payment/task) под entity_id = case_id,
--              чтобы лог дела показывал всю историю одним SELECT'ом.
--   - client — события клиента (создание/правка/удаление). Не привязано к case_id.

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
  -- Логирование никогда не должно ломать основную операцию. Глотаем всё.
  perform pg_notify('activity_log_failed', sqlerrm);
end;
$$;

grant execute on function public.log_activity(text, uuid, text, jsonb) to authenticated;

comment on function public.log_activity(text, uuid, text, jsonb) is
  'Шаг 10: безопасная запись в activity_log от authenticated. SECURITY DEFINER + видимость дела через private.can_see_case.';
