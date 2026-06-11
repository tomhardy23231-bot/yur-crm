-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.4.
--
-- Аудит: completion акта (full/partial) считается накопительно как
-- «Σ confirmed_amount по оплаченным актам ≥ contract_sum» (private.recompute_case_act_completions).
-- При изменении contract_sum дела пересчёт НЕ запускался — у уже оплаченных актов
-- оставалась устаревшая отметка completion (напр. был full при сумме 5000, сумму
-- подняли до 50000 — акт всё ещё «full», хотя покрытие частичное).
--
-- Решение: AFTER UPDATE OF contract_sum-триггер вызывает существующий пересчёт.
-- Сигнатура private.recompute_case_act_completions(p_case_id uuid) — один uuid-аргумент
-- (20260610160000_case_acts.sql). Миграция аддитивная (новый триггер).

create or replace function private.cases_recompute_acts_on_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contract_sum is distinct from old.contract_sum then
    perform private.recompute_case_act_completions(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists cases_recompute_acts_on_sum on public.cases;
create trigger cases_recompute_acts_on_sum
  after update of contract_sum on public.cases
  for each row
  execute function private.cases_recompute_acts_on_sum();

comment on function private.cases_recompute_acts_on_sum() is
  'v3 s1: смена contract_sum пересчитывает completion оплаченных актов дела '
  '(recompute_case_act_completions).';
