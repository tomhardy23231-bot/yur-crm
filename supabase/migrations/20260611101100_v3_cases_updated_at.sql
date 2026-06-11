-- Юр CRM — v3 Сессия 4: optimistic locking для дел (docs/PLAN-V3.md, 4.4).
--
-- Зачем: конкурентная правка дела двумя пользователями = last-write-wins (второй
-- молча затирает первого). Добавляем версию-по-времени updated_at; форма редактирования
-- шлёт base_updated_at, а updateCaseAction обновляет строку только при совпадении
-- (.eq('updated_at', base)). Несовпадение → 0 строк → дружелюбная ошибка «обновите
-- страницу» вместо тихой потери чужих изменений.
--
-- Триггер touch_updated_at проставляет updated_at на КАЖДЫЙ UPDATE (в т.ч.
-- системный — recalc paid_total/debt от платежа): лок намеренно «грубый», любая
-- смена строки конфликтует с устаревшей формой (это корректно — данные формы
-- устарели). Аддитивная миграция: на проде существующие строки получат now().

alter table public.cases
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cases_touch_updated_at on public.cases;
create trigger cases_touch_updated_at
  before update on public.cases
  for each row
  execute function private.touch_updated_at();
