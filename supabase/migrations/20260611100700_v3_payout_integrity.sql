-- Юр CRM — v3 Сессия 2 (Журнал и целостность), часть 2: целостность выплат ЗП.
--
-- Аудит: (а) одна и та же (дело, роль) могла попасть в выплату дважды; (б) сумма
-- аллокаций ничем не сверялась с суммой транзакции-выплаты; (в) create_payout не
-- проверял, что дело действительно за сотрудником в указанной роли; (г) ставки
-- payroll_rates можно было удалить (категории фиксированы — удалять нельзя).

-- ========================================================================
-- 1) Уникальность: одна (транзакция, дело, роль) — одна строка распределения
-- ========================================================================
create unique index if not exists payout_allocations_uniq
  on public.payout_allocations (transaction_id, case_id, role_in_case);

-- ========================================================================
-- 2) Согласованность суммы выплаты с её распределением по делам
-- ========================================================================
-- Инвариант (согласовано с пользователем, v3 s2): Σ аллокаций ПО ДЕЛАМ ≤ amount
-- транзакции-выплаты. Строгое равенство НЕ годится: createPayoutAction намеренно
-- включает в одну выплату ещё и долю премии сверх распределённого по делам
-- (amount = Σ аллокаций + bonusAmount), поэтому Σ аллокаций может быть меньше amount.
-- Превышение (Σ > amount) — реальная ошибка (выплачено по делам больше, чем сумма
-- движения денег) → запрещаем. Транзакции без аллокаций (премии/удержания) и
-- не-payout транзакции проверка не трогает.
--
-- Триггер DEFERRABLE INITIALLY DEFERRED: внутри create_payout сумма и аллокации
-- пишутся в одной транзакции — проверка должна сработать на КОММИТЕ, когда обе части
-- уже на месте.
create or replace function private.check_payout_allocations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx_id  uuid;
  v_kind   text;
  v_amount numeric(14, 2);
  v_sum    numeric(14, 2);
begin
  -- transaction_id зависит от того, на какой таблице сработал триггер.
  if tg_table_name = 'payroll_transactions' then
    v_tx_id := coalesce(new.id, old.id);
  else
    v_tx_id := coalesce(new.transaction_id, old.transaction_id);
  end if;
  if v_tx_id is null then
    return null;
  end if;

  select kind, amount into v_kind, v_amount
    from public.payroll_transactions
   where id = v_tx_id;
  if not found then
    return null;             -- транзакция уже удалена (каскад аллокаций) — нечего сверять
  end if;
  if v_kind <> 'payout' then
    return null;             -- премии/удержания без распределения не трогаем
  end if;

  select coalesce(sum(amount), 0) into v_sum
    from public.payout_allocations
   where transaction_id = v_tx_id;

  if v_sum > v_amount then
    raise exception 'payout allocations (%) exceed transaction amount (%)', v_sum, v_amount
      using errcode = '23514';
  end if;

  return null;               -- AFTER-триггер: возвращаемое значение игнорируется
end;
$$;

drop trigger if exists check_payout_allocations_alloc on public.payout_allocations;
create constraint trigger check_payout_allocations_alloc
  after insert or update or delete on public.payout_allocations
  deferrable initially deferred
  for each row execute function private.check_payout_allocations();

drop trigger if exists check_payout_allocations_tx on public.payroll_transactions;
create constraint trigger check_payout_allocations_tx
  after update of amount on public.payroll_transactions
  deferrable initially deferred
  for each row execute function private.check_payout_allocations();

-- ========================================================================
-- 3) create_payout: аллокация — только на дело, где сотрудник реально в этой роли
-- ========================================================================
-- Тело скопировано из 20260601110000_payroll_manual_transactions.sql (последняя
-- версия, grep подтвердил — позже не пересоздавалась) + добавлена проверка
-- принадлежности дел перед вставкой.
create or replace function public.create_payout(
  p_user_id     uuid,
  p_comment     text,
  p_occurred_on date,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx_id uuid;
  v_total numeric(14, 2);
  v_actor uuid;
begin
  if not private.can_manage_users() then
    raise exception 'forbidden: only owner/admin can create payouts';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'no allocations provided';
  end if;

  -- v3 s2: каждая аллокация должна ссылаться на дело, где p_user_id состоит в
  -- указанной роли (lawyer_id / responsible_id). Иначе выплату можно было бы
  -- «повесить» на чужое дело.
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) x
    left join public.cases c on c.id = (x->>'case_id')::uuid
    where c.id is null
       or (x->>'role_in_case') not in ('lawyer', 'expert')
       or ((x->>'role_in_case') = 'lawyer' and c.lawyer_id      is distinct from p_user_id)
       or ((x->>'role_in_case') = 'expert' and c.responsible_id is distinct from p_user_id)
  ) then
    raise exception 'allocation references a case not assigned to this user in that role'
      using errcode = '42501';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_allocations) x;

  if v_total <= 0 then
    raise exception 'payout total must be positive';
  end if;

  v_actor := (select private.active_uid());

  insert into public.payroll_transactions
    (user_id, kind, amount, comment, occurred_on, created_by)
  values
    (p_user_id, 'payout', v_total, nullif(btrim(coalesce(p_comment, '')), ''),
     coalesce(p_occurred_on, current_date), v_actor)
  returning id into v_tx_id;

  insert into public.payout_allocations (transaction_id, case_id, role_in_case, amount)
  select v_tx_id,
         (x->>'case_id')::uuid,
         x->>'role_in_case',
         (x->>'amount')::numeric
    from jsonb_array_elements(p_allocations) x;

  return v_tx_id;
end;
$$;

grant execute on function public.create_payout(uuid, text, date, jsonb) to authenticated;

comment on function public.create_payout(uuid, text, date, jsonb) is
  'Атомарно создаёт выплату (payroll_transactions kind=payout) и её распределение по '
  'делам (payout_allocations). Сумма = Σ аллокаций. Только owner/admin. v3 s2: проверяет '
  'принадлежность каждого дела сотруднику в указанной роли.';

-- ========================================================================
-- 4) payroll_rates: запрет DELETE (категории фиксированы — только править/добавлять)
-- ========================================================================
-- Была единая FOR ALL политика payroll_rates_write_owner (cap edit_payroll_rates).
-- Разбиваем на UPDATE + INSERT; DELETE-политики нет → RLS запрещает удаление.
drop policy if exists payroll_rates_write_owner on public.payroll_rates;

create policy payroll_rates_update_owner
  on public.payroll_rates
  for update
  to authenticated
  using      (private.can('edit_payroll_rates'))
  with check (private.can('edit_payroll_rates'));

create policy payroll_rates_insert_owner
  on public.payroll_rates
  for insert
  to authenticated
  with check (private.can('edit_payroll_rates'));
