-- Юр CRM — v3 Сессия 7 (Продукт), часть 1: исход дела «не заключили» (lost).
--
-- Зачем (PLAN-V3 7.1): воронка не имела исхода «потеряли» — конверсия и
-- окупаемость источников были неисчислимы. Вводим:
--   • cases.outcome ('lost' | NULL) — у закрытого дела NULL = завершено штатно,
--     'lost' = договор НЕ заключили (отказ до контракта). Отдельного enum-этапа НЕТ;
--   • cases.lost_reason — свободный текст причины (≤500), опционально;
--   • RPC public.close_case_lost(case_id, reason) — переводит дело с этапа
--     new_request|consultation в closed+lost, логирует 'case_lost';
--   • lost-ветку в private.cases_validate_stage_forward — прыжок
--     new_request|consultation → closed легитимен ТОЛЬКО как lost (право и журнал
--     обеспечивает RPC; формы UI outcome не шлют, поэтому штатный «прыжок» по-прежнему
--     запрещён не-staff).
--
-- Действие журнала 'case_lost' добавляется в allowlist отдельной миграцией
-- (20260611101400_v3_activity_case_lost — правило грабли №1: пересоздание CHECK +
-- log_activity ПОВЕРХ полного прежнего списка). Порядок применения не критичен:
-- close_case_lost вызывает log_activity лишь в рантайме (после всех миграций).

-- ── Колонки исхода ───────────────────────────────────────────────────────
alter table public.cases add column if not exists outcome text
  check (outcome in ('lost')),
  add column if not exists lost_reason text check (char_length(lost_reason) <= 500);

-- На проде у дел исторических данных по outcome нет, но констрейнт «lost ⇒ closed»
-- объявляем NOT VALID (единообразие с прочими v3-чеками; VALIDATE не гоняем).
alter table public.cases add constraint cases_lost_requires_closed
  check (outcome is null or stage = 'closed') not valid;

comment on column public.cases.outcome is
  'Исход закрытого дела: NULL = завершено штатно (договор был); ''lost'' = не заключили '
  'договор (закрыто с этапа new_request|consultation через public.close_case_lost).';
comment on column public.cases.lost_reason is
  'Свободный текст причины «не заключили» (≤500); заполняется в close_case_lost.';

-- ── RPC: закрыть дело как «не заключили» ──────────────────────────────────
-- SECURITY DEFINER (обходит RLS UPDATE) → САМ проверяет права: дело видимо зрителю
-- И (staff ИЛИ зритель — юрист дела). Разрешено только до контракта
-- (new_request|consultation). closed_at — date, ставим киевскую дату (как kyivToday()
-- в TS; чисто now()::date уехал бы на TZ сервера). Журнал — public.log_activity
-- (фактическое имя писателя журнала; см. 20260527110000_activity_log_writer).
create or replace function public.close_case_lost(p_case_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
begin
  select * into v_case from public.cases where id = p_case_id for update;
  if not found then
    raise exception 'case not found';
  end if;

  -- Права: staff ИЛИ юрист дела; и дело видимо зрителю (скоуп подразделения).
  if not (private.case_visible(v_case.lawyer_id, v_case.responsible_id)
          and (private.is_staff() or v_case.lawyer_id = private.active_uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Только до контракта: lost — это отказ ДО заключения договора.
  if v_case.stage not in ('new_request', 'consultation') then
    raise exception 'lost outcome is only for cases before the contract';
  end if;

  update public.cases
     set stage       = 'closed',
         closed_at   = (now() at time zone 'Europe/Kyiv')::date,
         outcome     = 'lost',
         lost_reason = nullif(btrim(p_reason), '')
   where id = p_case_id;

  perform public.log_activity(
    'case', p_case_id, 'case_lost',
    jsonb_build_object('reason', nullif(btrim(p_reason), ''))
  );
end;
$$;

grant execute on function public.close_case_lost(uuid, text) to authenticated;

comment on function public.close_case_lost(uuid, text) is
  'v3 s7: закрывает дело как «не заключили» (stage→closed, outcome=lost, closed_at, '
  'lost_reason) с этапа new_request|consultation. Право: staff или юрист дела + '
  'видимость дела. Логирует case_lost. SECURITY DEFINER (проверка прав внутри).';

-- ── Триггер этапов: lost-прыжок легитимен ─────────────────────────────────
-- Скопировано ЦЕЛИКОМ из 20260530180000_stage_strict_forward.sql (последняя версия)
-- + добавлена lost-ветка В НАЧАЛО. Остальное тело без изменений.
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
  -- v3 s7: «не заключили» — легитимный прыжок new_request|consultation → closed.
  -- Право и журнал (case_lost) выполнены в public.close_case_lost; формы UI поле
  -- outcome не отправляют, поэтому обычный «прыжок» в closed по-прежнему отсекается
  -- ветками ниже (new.outcome там NULL).
  if new.stage = 'closed' and new.outcome = 'lost' then
    return new;
  end if;

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
  'Задача 8 + v3 s7: не-staff двигают этап только на +1 (откат → stage_backward_forbidden, '
  'прыжок → stage_skip_forbidden); staff может перескочить/откатить с записью '
  'stage_corrected. Исключение: closed+outcome=lost — легитимный lost-прыжок '
  '(через public.close_case_lost).';
