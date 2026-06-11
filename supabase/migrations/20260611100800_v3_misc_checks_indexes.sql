-- Юр CRM — v3 Сессия 2 (Журнал и целостность), часть 3: чеки данных и индексы.
--
-- Аудит: нет CHECK на формат inn клиента и на closed_at < opened_at; имя счёта
-- кассы не уникально; отпуска одного сотрудника могли пересекаться; «горячие» FK
-- (created_by/uploaded_by/...) без индексов → seq scan при join/фильтрах.

-- ========================================================================
-- 1) CHECK-констрейнты (NOT VALID — на проде возможны исторические данные)
-- ========================================================================
-- NOT VALID: констрейнт применяется ко ВСЕМ новым/изменяемым строкам, но старые
-- не перепроверяются (db push на прод не упадёт на легаси). VALIDATE CONSTRAINT
-- намеренно НЕ выполняем.
alter table public.clients
  add constraint clients_inn_format
  check (inn is null or inn ~ '^[0-9]{8,12}$') not valid;

alter table public.cases
  add constraint cases_closed_after_opened
  check (closed_at is null or closed_at >= opened_at) not valid;

-- ========================================================================
-- 2) Уникальность имени счёта кассы (без учёта регистра)
-- ========================================================================
create unique index if not exists cash_accounts_name_uniq
  on public.cash_accounts (lower(name));

-- ========================================================================
-- 3) Непересечение отпусков одного сотрудника
-- ========================================================================
-- Триггером, а не exclude-констрейнтом: exclude перепроверил бы все строки при
-- db push и упал бы на исторических пересечениях. Триггер действует только на
-- новые INSERT (правка отпуска = удалить + создать, UPDATE-политики у absences нет).
create or replace function private.absences_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.absences a
    where a.user_id = new.user_id
      and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and a.starts_on <= new.ends_on
      and a.ends_on   >= new.starts_on
  ) then
    raise exception 'absence period overlaps an existing one for this user'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists absences_no_overlap on public.absences;
create trigger absences_no_overlap
  before insert on public.absences
  for each row execute function private.absences_no_overlap();

-- ========================================================================
-- 4) Индексы на «горячие» внешние ключи (все if not exists)
-- ========================================================================
create index if not exists payments_created_by_idx
  on public.payments (created_by);
create index if not exists documents_uploaded_by_idx
  on public.documents (uploaded_by);
create index if not exists tasks_created_by_idx
  on public.tasks (created_by);
create index if not exists cases_archived_by_idx
  on public.cases (archived_by);
create index if not exists cash_entries_case_id_idx
  on public.cash_entries (case_id);
create index if not exists cash_entries_created_by_idx
  on public.cash_entries (created_by);
create index if not exists case_acts_created_by_idx
  on public.case_acts (created_by);
create index if not exists case_acts_scan_document_id_idx
  on public.case_acts (scan_document_id);
create index if not exists payroll_ledger_created_by_idx
  on public.payroll_ledger (created_by);
create index if not exists absences_created_by_idx
  on public.absences (created_by);
create index if not exists payroll_transactions_created_by_idx
  on public.payroll_transactions (created_by);
