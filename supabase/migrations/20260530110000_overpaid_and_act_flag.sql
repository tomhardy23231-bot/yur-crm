-- Юр CRM — Видимость переплаты + пометка «завершено без акта» (Задачи 3, 4).
--
--   Задача 3 (важно): debt = max(0, contract_sum − paid_total) скрывает факт
--     переплаты. Добавляем дериватив overpaid = max(0, paid_total − contract_sum),
--     пересчитываемый тем же BEFORE-триггером, что и debt.
--   Задача 4 (важно): дело можно закрыть без документа doc_type='act'. Жёстко
--     не запрещаем, но помечаем cases.closed_without_act, чтобы владелец видел
--     такие дела (бейдж в списке/карточке, будущая аналитика). Флаг
--     выставляется при закрытии, если акта нет, и сбрасывается, когда акт позже
--     догружают (или дело выходит из closed).

-- ========================================================================
-- 1) Задача 3 — overpaid (переплата клиента)
-- ========================================================================

alter table public.cases
  add column overpaid numeric(14, 2) not null default 0,
  add constraint cases_overpaid_nonneg check (overpaid >= 0);

comment on column public.cases.overpaid is
  'Дериватив: max(0, paid_total − contract_sum). Переплата клиента. Считается триггером cases_recompute_debt. Задача 3.';

-- Расширяем существующий BEFORE-триггер: debt И overpaid за один проход.
-- (Триггер cases_recompute_debt на INSERT/UPDATE OF contract_sum, paid_total
--  создан в 20260526100100_core_tables.sql и остаётся прежним.)
create or replace function private.cases_recompute_debt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.debt     := greatest(new.contract_sum - coalesce(new.paid_total, 0), 0);
  new.overpaid := greatest(coalesce(new.paid_total, 0) - new.contract_sum, 0);
  return new;
end;
$$;

-- Бэкфилл для существующих дел (триггер не сработал на уже лежащие строки).
update public.cases
   set overpaid = greatest(coalesce(paid_total, 0) - contract_sum, 0)
 where greatest(coalesce(paid_total, 0) - contract_sum, 0) <> overpaid;

-- ========================================================================
-- 2) Задача 4 — closed_without_act (завершено без акта)
-- ========================================================================

alter table public.cases
  add column closed_without_act boolean not null default false;

comment on column public.cases.closed_without_act is
  'true, если дело closed, но документа doc_type=act нет. Мягкая пометка (не блок). Сбрасывается при догрузке акта или выходе из closed. Задача 4.';

-- BEFORE-триггер на смене этапа: при входе в closed считаем, есть ли акт;
-- вне closed флаг всегда false. На INSERT новое дело актов ещё не имеет →
-- closed_without_act=true, если его сразу создают closed.
create or replace function private.cases_set_closed_without_act()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'closed' then
    new.closed_without_act := not exists (
      select 1 from public.documents
       where case_id = new.id and doc_type = 'act'
    );
  else
    new.closed_without_act := false;
  end if;
  return new;
end;
$$;

create trigger cases_set_closed_without_act
before insert or update of stage on public.cases
for each row execute function private.cases_set_closed_without_act();

-- AFTER-триггер на documents: при добавлении/удалении/смене типа акта
-- пересчитываем флаг у связанного дела (сброс при догрузке, установка при
-- удалении последнего акта у закрытого дела). Обновление ТОЛЬКО колонки
-- closed_without_act не запускает cases_set_closed_without_act (он на OF stage)
-- и не трогает финансовые/леджер-триггеры (они на свои колонки).
create or replace function private.documents_sync_act_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case uuid;
begin
  v_case := coalesce(new.case_id, old.case_id);
  if v_case is null then
    return null;
  end if;

  update public.cases c
     set closed_without_act = (
           c.stage = 'closed'
           and not exists (
             select 1 from public.documents d
              where d.case_id = c.id and d.doc_type = 'act'
           )
         )
   where c.id = v_case;

  return null;  -- AFTER-триггер
end;
$$;

create trigger documents_sync_act_flag
after insert or delete or update of doc_type on public.documents
for each row execute function private.documents_sync_act_flag();

-- Бэкфилл: закрытые дела без акта помечаем сразу.
update public.cases c
   set closed_without_act = (
         c.stage = 'closed'
         and not exists (
           select 1 from public.documents d
            where d.case_id = c.id and d.doc_type = 'act'
         )
       )
 where c.stage = 'closed';
