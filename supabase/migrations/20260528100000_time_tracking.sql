-- Юр CRM — Phase 2 / Step A: учёт рабочего времени (time_entries).
--
-- Цель: специалист логирует часы на дело (опционально привязка к task);
-- агрегаты по делу/пользователю/периоду; основа для почасовых счетов
-- (Phase 2 / Step B — инвойсы). CLAUDE.md §9 Q12.
--
-- Модель:
--   - minutes (int >0, ≤24*60) — целые минуты; UI парсит «1ч 30м» / «1.5» /
--     «90» / «1:30». Дробных часов не храним → нет float-проблем.
--   - hourly_rate — snapshot на момент создания. При смене cases.hourly_rate
--     старые entries не плывут (как и amount у payments). Если null —
--     entry непочасовой (например, для fixed-fee дел просто учёт времени).
--   - billable — флаг «оплачиваемое»; pro bono / внутренние работы могут
--     учитываться, но не попадать в счета.
--   - invoice_id — placeholder колонка для будущих инвойсов (Step B).
--     FK пока НЕ ставим (таблицы нет); как только она появится, добавим
--     отдельной миграцией alter table … add constraint … references invoices.
--   - updated_at — entries правят чаще, чем payments/tasks (опечатки в
--     минутах, уточнение note), плюс задел под аналитику «когда правили».
--
-- RLS: наследует от cases (как tasks/documents/payments).
--   - SELECT/INSERT — can_see_case / can_write_case (specialist + assistant
--     супервайзера). INSERT: user_id = active_uid (нельзя приписать чужому).
--   - UPDATE/DELETE — свои entries + is_staff (как и положено по аналогии
--     с tasks: specialist правит своё, owner/admin — любое).
--
-- Activity log: расширяем allowlist + CHECK на 3 новых action'а.

-- ========================================================================
-- 1) cases.hourly_rate — дефолтная ставка по делу
-- ========================================================================

alter table public.cases
  add column hourly_rate numeric(10, 2) null;

alter table public.cases
  add constraint cases_hourly_rate_nonneg check (hourly_rate is null or hourly_rate >= 0);

comment on column public.cases.hourly_rate is
  'Дефолтная почасовая ставка по делу для time_entries. NULL = не настроено. Snapshot копируется в time_entries.hourly_rate при создании.';

-- ========================================================================
-- 2) time_entries
-- ========================================================================

create table public.time_entries (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  task_id      uuid          references public.tasks(id) on delete set null,
  user_id      uuid not null references public.users(id) on delete restrict,
  spent_at     date not null,
  minutes      int  not null,
  billable     boolean not null default true,
  hourly_rate  numeric(10, 2),
  note         text,
  -- invoice_id: заложен под Phase 2 / Step B (инвойсы). FK добавим, когда
  -- появится таблица public.invoices. Сейчас просто uuid + index, чтобы
  -- listMyTimeEntries мог фильтровать «не выставленные» (invoice_id is null).
  invoice_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint time_entries_minutes_positive  check (minutes > 0 and minutes <= 24 * 60),
  constraint time_entries_rate_nonneg       check (hourly_rate is null or hourly_rate >= 0),
  constraint time_entries_note_short        check (note is null or length(note) <= 500)
);

create index time_entries_case_idx     on public.time_entries(case_id);
create index time_entries_user_date    on public.time_entries(user_id, spent_at desc);
create index time_entries_task_idx     on public.time_entries(task_id) where task_id is not null;
create index time_entries_invoice_idx  on public.time_entries(invoice_id) where invoice_id is not null;

comment on table public.time_entries is
  'Учёт рабочего времени специалиста на дело. Minutes хранятся как int (1ч 30м = 90). Связь с tasks опциональна.';

comment on column public.time_entries.minutes is
  'Целое число минут. UI парсит «1ч 30м» / «1.5» / «90» / «1:30». Хранение в минутах исключает float-погрешности агрегатов.';

comment on column public.time_entries.hourly_rate is
  'Snapshot ставки на момент создания (из cases.hourly_rate). Не меняется при последующих правках case.hourly_rate.';

comment on column public.time_entries.invoice_id is
  'Phase 2/B placeholder. FK на public.invoices появится позже.';

-- Триггер updated_at. Cases/tasks/payments его не имеют (там история через
-- activity_log diff), но entries правят часто и предсказуемое updated_at
-- упростит аналитику «когда последний раз корректировали лог».
create or replace function private.time_entries_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger time_entries_set_updated_at
before update on public.time_entries
for each row execute function private.time_entries_set_updated_at();

-- ========================================================================
-- 3) RLS — наследование от cases (тот же паттерн, что tasks/documents/payments)
-- ========================================================================

alter table public.time_entries enable row level security;

-- SELECT — видим там же, где видим дело.
create policy time_entries_select_via_case
  on public.time_entries
  for select
  to authenticated
  using (private.can_see_case(case_id));

-- INSERT — можем писать там же, где можем писать в дело; user_id обязан
-- совпадать с active_uid (нельзя приписать time-entry чужому пользователю,
-- как с tasks.created_by / payments.created_by).
create policy time_entries_insert_via_case
  on public.time_entries
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and user_id = (select private.active_uid())
  );

-- UPDATE — автор entry или is_staff. (Аналог tasks_update_via_case + payments
-- staff-only: специалист обычно правит свои часы, admin — любые при корректировке.)
create policy time_entries_update_owner_or_staff
  on public.time_entries
  for update
  to authenticated
  using (
    private.is_staff()
    or user_id = (select private.active_uid())
  )
  with check (
    private.is_staff()
    or user_id = (select private.active_uid())
  );

-- DELETE — то же: свои + staff. (Аналогично tasks_delete_via_case.)
create policy time_entries_delete_owner_or_staff
  on public.time_entries
  for delete
  to authenticated
  using (
    private.is_staff()
    or user_id = (select private.active_uid())
  );

-- ========================================================================
-- 4) Activity log allowlist — расширяем на 3 новых action'а
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
    'time_entry_created', 'time_entry_updated', 'time_entry_deleted'
  ));

-- log_activity: добавляем 3 action'а в allowlist; остальная логика
-- (CSO #1 size cap, MED#7 is_staff bypass для *_deleted) — без изменений.
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

  if p_action not in (
    'case_created', 'case_updated', 'case_deleted',
    'client_created', 'client_updated', 'client_deleted',
    'document_uploaded', 'document_deleted',
    'payment_created', 'payment_deleted',
    'task_created', 'task_updated', 'task_toggled', 'task_deleted',
    'time_entry_created', 'time_entry_updated', 'time_entry_deleted'
  ) then
    return;
  end if;

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

  -- MED#7 — is_staff bypass для *_deleted (entity уже удалена,
  -- can_see_case вернёт false).
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
  'Phase 1 + Phase 2/A: SECURITY DEFINER, allowlist (включая time_entry_*), size cap, is_staff bypass для *_deleted.';
