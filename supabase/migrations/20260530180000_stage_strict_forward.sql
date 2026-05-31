-- Юр CRM — Задача 8: запрет «прыжков» по этапам воронки.
--
-- Проблема: прежний триггер cases_validate_stage_forward пускал ЛЮБОЕ движение
--   вперёд (order(new) >= order(old)). Значит обычная роль (lawyer/expert) могла
--   из «Консультация» сразу прыгнуть в «Завершено», минуя промежуточные этапы —
--   и тем самым закрыть дело (а с ним зафиксировать начисление ЗП) в обход
--   нормального процесса.
--
-- Новое правило (CLAUDE.md §6 «движение только вперёд», §7-2):
--   • Обычные роли (не-staff): только строго на СЛЕДУЮЩИЙ этап (order+1).
--       - откат назад            → stage_backward_forbidden (как было);
--       - прыжок вперёд (>+1)     → stage_skip_forbidden (новое).
--   • Staff (owner/admin/office_manager — private.is_staff(), §7-2 «ручное
--     исправление этапа — только staff»): любой переход разрешён (перескочить
--     или откатить) — но всё, что НЕ обычный шаг +1 вперёд, фиксируется в
--     activity_log как 'stage_corrected' (как уже работало для отката).
--
-- Только переопределяем функцию; сам триггер (before update of stage) остаётся.

create or replace function private.cases_validate_stage_forward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from int := private.case_stage_order(old.stage);
  v_to   int := private.case_stage_order(new.stage);
begin
  -- no-op: UPDATE затронул stage, но значение не изменилось — тихо выходим.
  if new.stage = old.stage then
    return new;
  end if;

  if private.is_staff() then
    -- Staff: обычный шаг вперёд (+1) — штатное движение, без записи в журнал.
    -- Любая «коррекция» (прыжок вперёд через этап или откат назад) — логируем.
    if v_to <> v_from + 1 then
      insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
      values (
        'case',
        new.id,
        private.active_uid(),
        'stage_corrected',
        jsonb_build_object('from', old.stage::text, 'to', new.stage::text)
      );
    end if;
    return new;
  end if;

  -- Не-staff (lawyer/expert): только строго следующий этап.
  if v_to = v_from + 1 then
    return new; -- штатный шаг вперёд
  end if;

  if v_to < v_from then
    raise exception 'stage_backward_forbidden: cannot move case % from % to %',
      new.id, old.stage, new.stage
      using errcode = 'P0001';
  end if;

  -- v_to > v_from + 1 — прыжок через этап(ы).
  raise exception 'stage_skip_forbidden: cannot skip stages for case % (% -> %)',
    new.id, old.stage, new.stage
    using errcode = 'P0001';
end;
$$;

comment on function private.cases_validate_stage_forward() is
  'Задача 8: не-staff двигают этап только на +1 (откат → stage_backward_forbidden, '
  'прыжок → stage_skip_forbidden); staff может перескочить/откатить с записью '
  'stage_corrected в activity_log.';
