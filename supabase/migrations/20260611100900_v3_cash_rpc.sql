-- v3 s3: касса — SQL-перенос остатка, бэкфилл пропущенных платежей, счётчик
-- несинхронизированных платежей. Аудит (подтверждено): getCashReportData качал ВСЮ
-- историю cash_entries, а потолок PostgREST max_rows=1000 тихо резал выдачу — из-за
-- ascending-сортировки первыми терялись СВЕЖИЕ операции; платежи, внесённые до создания
-- счетов кассы, навсегда выпадали из кассы (нет бэкфилла).
--
-- Три SECURITY DEFINER-функции (обходят RLS кассы — право проверяется ВНУТРИ через
-- private.can('can_manage_cash'), как в confirm_act_paid; auth.uid() в DEFINER берётся
-- из JWT-GUC и указывает на вызывающего):
--   • cash_balances_before(p_before) — чистый перенос остатка по счетам строго ДО даты
--     (операции раньше opening_date уже зашиты в opening_balance → исключаем);
--   • cash_backfill_payments() — заводит недостающие cash_entries для платежей без них
--     (идемпотентно: NOT EXISTS по payment_id; счёт/описание — РОВНО как у автоприхода
--     private.cash_sync_on_payment, чтобы бэкфильнутые строки были неотличимы от авто);
--   • cash_unsynced_payments_count() — сколько платежей ещё не отражены в кассе (баннер).
--
-- payments.paid_at имеет тип date (20260526100100_core_tables.sql) → без ::date-каста.
--
-- Откат: drop function public.cash_balances_before(date),
--   public.cash_backfill_payments(), public.cash_unsynced_payments_count().

-- ========================================================================
-- 1) Перенос остатка по счетам строго ДО даты («остаток на начало месяца»)
-- ========================================================================
create or replace function public.cash_balances_before(p_before date)
returns table (account_id uuid, balance numeric)
language sql
security definer
set search_path = ''
as $$
  select e.account_id,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)
  from public.cash_entries e
  join public.cash_accounts a on a.id = e.account_id
  where e.entry_date < p_before
    and e.entry_date >= a.opening_date     -- операции до opening_date уже в opening_balance
    and private.can('can_manage_cash')     -- право проверяется внутри DEFINER
  group by e.account_id;
$$;

comment on function public.cash_balances_before(date) is
  'Перенос остатка по счетам кассы строго до p_before (исключая операции раньше '
  'opening_date — они уже в opening_balance). Эффективный остаток на начало = '
  'cash_accounts.opening_balance + balance. Право can_manage_cash. v3 s3.';

-- ========================================================================
-- 2) Бэкфилл: завести недостающие строки кассы по платежам без них
-- ========================================================================
-- Счёт резолвится тем же private.cash_resolve_account(method), что и автоприход;
-- платежи без резолва (acc.id is null — нет касс/метод не лёг ни на один счёт)
-- пропускаются (как в триггере). Идемпотентно: NOT EXISTS по payment_id.
create or replace function public.cash_backfill_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if not private.can('can_manage_cash') then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id, created_by)
  select acc.id,
         p.paid_at,
         'in',
         p.amount,
         left(coalesce(
           nullif(btrim(p.note), ''),
           'Оплата по справі' || coalesce(': ' || c.number_title, '')
         ), 300),
         p.case_id,
         p.id,
         p.created_by
  from public.payments p
  left join public.cases c on c.id = p.case_id
  cross join lateral (select private.cash_resolve_account(p.method) as id) acc
  where acc.id is not null
    and not exists (select 1 from public.cash_entries e where e.payment_id = p.id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.cash_backfill_payments() is
  'Заводит недостающие cash_entries для платежей без них (счёт/описание как у '
  'автоприхода). Идемпотентно. Право can_manage_cash. v3 s3.';

-- ========================================================================
-- 3) Сколько платежей ещё не отражены в кассе (баннер «Синхронизировать»)
-- ========================================================================
create or replace function public.cash_unsynced_payments_count()
returns integer
language sql
security definer
set search_path = ''
as $$
  select case
    when private.can('can_manage_cash') then (
      select count(*)::int
      from public.payments p
      where not exists (select 1 from public.cash_entries e where e.payment_id = p.id)
    )
    else 0
  end;
$$;

comment on function public.cash_unsynced_payments_count() is
  'Число платежей без связанной строки кассы (для баннера бэкфилла). Без права '
  'can_manage_cash возвращает 0. v3 s3.';

-- ========================================================================
-- 4) Grants
-- ========================================================================
grant execute on function public.cash_balances_before(date) to authenticated;
grant execute on function public.cash_backfill_payments() to authenticated;
grant execute on function public.cash_unsynced_payments_count() to authenticated;
