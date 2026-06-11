-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.2.
--
-- Аудит (lost update race): private.recalc_case_totals читает SUM(payments.amount)
-- и пишет cases.paid_total. Два параллельных платежа по одному делу: оба триггера
-- recalc стартуют, каждый видит сумму БЕЗ платежа второго (read committed snapshot),
-- последний writer затирает — один платёж «теряется» из paid_total (и из долга/ЗП).
--
-- Решение: сериализуем пересчёты по делу строчным локом cases FOR UPDATE. Второй
-- recalc ждёт коммита первого → его SUM уже включает первый платёж. Тело функции
-- скопировано ЦЕЛИКОМ из 20260526100100_core_tables.sql (последняя версия — grep
-- подтвердил, что позже не пересоздавалась) + добавлена ОДНА строка лока после
-- null-гарда и до вычисления суммы. Больше ничего не меняем.

create or replace function private.recalc_case_totals(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric(14, 2);
begin
  if p_case_id is null then
    return;
  end if;

  -- serialize concurrent payment recalcs per case (audit: lost update race)
  perform 1 from public.cases where id = p_case_id for update;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where case_id = p_case_id;

  -- Обновляем только paid_total — debt пересчитается BEFORE UPDATE триггером
  -- cases_recompute_debt (ниже).
  update public.cases
     set paid_total = v_paid
   where id = p_case_id;
end;
$$;
