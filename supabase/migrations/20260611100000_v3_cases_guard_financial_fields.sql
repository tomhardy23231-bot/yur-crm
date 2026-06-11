-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.1.
--
-- Аудит HIGH#1: юрист/Експерт своего дела через RLS-UPDATE (cases_update_staff_or_assignee
-- пускает к ЛЮБЫМ колонкам) мог поменять `category` (document 7% → representation 25%)
-- и поднять себе ЗП, либо переписать contract_sum / переназначить участников. Гард на
-- override-ставках (cases_guard_rate_overrides) этого не закрывал — это другие поля.
--
-- Решение: BEFORE UPDATE OF-триггер. Только staff (owner/admin/office_manager) меняет
-- поля, определяющие расчёт ЗП и принадлежность дела. Не-staff менять их не может —
-- но прочие поля (subject, priority, court*, tags, stage в рамках воронки) ему доступны,
-- как и раньше. TS-зеркало (updateCaseAction) даёт дружелюбную ошибку до похода в БД.
--
-- Сравнение через IS DISTINCT FROM обязательно: форма редактирования шлёт полный
-- payload, а BEFORE UPDATE OF срабатывает на присутствие колонки в SET даже без
-- реального изменения значения — без IS DISTINCT FROM любой сейв падал бы у юриста.
-- Миграция аддитивная (новый триггер; данные не трогает).

create or replace function private.cases_guard_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_staff() then
    return new;
  end if;
  if new.category        is distinct from old.category
  or new.contract_sum    is distinct from old.contract_sum
  or new.lawyer_id       is distinct from old.lawyer_id
  or new.responsible_id  is distinct from old.responsible_id
  or new.client_id       is distinct from old.client_id then
    raise exception 'only staff can change financial fields of a case'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cases_guard_financial_fields on public.cases;
create trigger cases_guard_financial_fields
  before update of category, contract_sum, lawyer_id, responsible_id, client_id
  on public.cases
  for each row
  execute function private.cases_guard_financial_fields();

comment on function private.cases_guard_financial_fields() is
  'v3 s1: только staff (is_staff) меняет ЗП-определяющие поля дела '
  '(category/contract_sum/lawyer_id/responsible_id/client_id). Аудит HIGH#1.';
