-- Юр CRM — «Сколько дней дело на текущем этапе» (U6).
--
-- Момент последней смены этапа нигде не хранился (был только opened_at/closed_at).
-- Добавляем cases.stage_changed_at: момент входа дела в ТЕКУЩИЙ этап. По нему UI
-- считает «N дней на этапе», чтобы видеть зависшие дела.
--
-- Заполняется триггером при смене stage (отдельным от валидации воронки
-- cases_validate_stage_forward — у того своя ответственность). На INSERT —
-- default now(). Бэкфилл существующих: closed → closed_at, иначе opened_at
-- (date→timestamptz = полночь; для подсчёта дней этого достаточно).

alter table public.cases
  add column stage_changed_at timestamptz not null default now();

comment on column public.cases.stage_changed_at is
  'Момент входа дела в текущий этап (stage). Обновляется триггером при смене stage. '
  'Для индикатора «N дней на этапе» (U6).';

-- Бэкфилл: для уже лежащих строк триггер не срабатывал.
update public.cases
   set stage_changed_at = coalesce(closed_at, opened_at)::timestamptz;

-- BEFORE-триггер: при фактической смене этапа фиксируем now(). Срабатывает на
-- UPDATE OF stage; внутри проверяем, что значение реально изменилось (PostgREST
-- может слать stage в SET без изменения). На INSERT отдельно не нужен — default.
create or replace function private.cases_set_stage_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger cases_set_stage_changed_at
before update of stage on public.cases
for each row execute function private.cases_set_stage_changed_at();
