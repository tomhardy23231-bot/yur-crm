-- Юр CRM — Шаг 6: воронка движется только вперёд (CLAUDE.md §6, §7-2).
--
-- Назначение:
--   - сравнить позицию старого и нового этапа в линейной воронке;
--   - запретить откат на предыдущий этап обычным сотрудникам (specialist/assistant);
--   - разрешить staff (owner/admin) ручное исправление с обязательной записью
--     в public.activity_log (action='stage_corrected').
--
-- Почему security definer:
--   - триггеру нужно писать в public.activity_log; у user-ролей INSERT-политики
--     на activity_log нет (журнал append-only из триггеров/service_role —
--     см. 20260526100200_rls_policies.sql);
--   - set search_path = '' защищает от search_path hijacking.

-- Позиция этапа в воронке. Pure SQL, не security definer — функция нужна только
-- внутри триггера ниже и не должна быть доступна snyone.
create or replace function private.case_stage_order(s public.case_stage)
returns int
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new_request'::public.case_stage       then 1
    when 'consultation'::public.case_stage      then 2
    when 'in_progress'::public.case_stage       then 3
    when 'pretrial'::public.case_stage          then 4
    when 'litigation'::public.case_stage        then 5
    when 'awaiting_decision'::public.case_stage then 6
    when 'enforcement'::public.case_stage       then 7
    when 'closed'::public.case_stage            then 8
  end
$$;

create or replace function private.cases_validate_stage_forward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Триггер OF stage срабатывает даже когда UPDATE содержит SET stage = old.stage.
  -- Дёшево обрезаем no-op, чтобы не плодить мусорные записи в activity_log.
  if new.stage = old.stage then
    return new;
  end if;

  -- Движение вперёд (или на том же месте — уже отсечено выше) — всегда ок.
  if private.case_stage_order(new.stage) >= private.case_stage_order(old.stage) then
    return new;
  end if;

  -- Откат назад: для обычных пользователей запрещён.
  if not private.is_staff() then
    raise exception 'stage_backward_forbidden: cannot move case % from % to %',
      new.id, old.stage, new.stage
      using errcode = 'P0001';
  end if;

  -- Staff-fallback: фиксируем исправление в журнале. user_id будет NULL,
  -- если правка идёт через service_role (миграции/сид) — это намеренно.
  insert into public.activity_log (entity_type, entity_id, user_id, action, changes)
  values (
    'case',
    new.id,
    private.active_uid(),
    'stage_corrected',
    jsonb_build_object('from', old.stage::text, 'to', new.stage::text)
  );

  return new;
end;
$$;

create trigger cases_validate_stage_forward
before update of stage on public.cases
for each row execute function private.cases_validate_stage_forward();

comment on function private.cases_validate_stage_forward() is
  'Шаг 6: блокирует откат stage для не-staff; staff может откатить с записью в activity_log.';
