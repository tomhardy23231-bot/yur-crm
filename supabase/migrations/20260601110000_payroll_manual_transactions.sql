-- Юр CRM — Ручные движения зарплаты: выплаты (с распределением по делам) и премии.
--
-- Правка клиента №1 — новая модель отчёта по ЗП:
--   «Начислено»  — считается ВЖИВУЮ (paid_total × ставка роли), ничего не фиксируем;
--                  включает и открытые дела (заработок растёт по мере оплат).
--   «Движения»   — ручные записи owner/admin (никакой автоматики по датам):
--       payout (выплата, «−») с распределением по делам (payout_allocations);
--       bonus  (премия, «+») мимо заработанных дел.
--   Баланс сотрудника = начислено за дела + премии − выплаты = «к выплате».
--   «Аванс» (по словам клиента) — это просто первая выплата месяца (15-го);
--   отдельной сущности нет, это тот же payout с датой/комментарием.
--
-- В UI это ЗАМЕНЯЕТ старый payroll_ledger (accrued/paid). Сам ledger и его триггеры
-- пока остаются в БД (удалим отдельной миграцией) — новый отчёт их не использует.
--
-- Видимость (как в payroll_by_specialist, Задача 1): RPC — SECURITY DEFINER с явным
-- фильтром зрителя (private.* нельзя звать из SECURITY INVOKER — схема private
-- закрыта от authenticated). Staff видит всех, сотрудник — только себя.

-- ========================================================================
-- 1) payroll_transactions — ручные движения (выплата / премия)
-- ========================================================================

create table public.payroll_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete restrict,
  kind        text not null check (kind in ('payout', 'bonus')),
  amount      numeric(14, 2) not null check (amount > 0),
  comment     text,
  occurred_on date not null default current_date,  -- дата выплаты/премии (ставит owner)
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index payroll_transactions_user_idx on public.payroll_transactions(user_id);
create index payroll_transactions_kind_idx on public.payroll_transactions(kind);

comment on table public.payroll_transactions is
  'Ручные движения зарплаты: payout (выплата, минус) и bonus (премия, плюс). Выплата '
  'распределяется по делам в payout_allocations. Не путать с payments (оплаты клиента) '
  'и payroll_ledger (старый, новым отчётом не используется).';

-- ========================================================================
-- 2) payout_allocations — какие дела (и роль в них) вошли в выплату
-- ========================================================================

create table public.payout_allocations (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payroll_transactions(id) on delete cascade,
  case_id        uuid not null references public.cases(id) on delete restrict,
  role_in_case   text not null check (role_in_case in ('lawyer', 'expert')),
  amount         numeric(14, 2) not null check (amount > 0)
);

create index payout_allocations_tx_idx   on public.payout_allocations(transaction_id);
create index payout_allocations_case_idx on public.payout_allocations(case_id);

comment on table public.payout_allocations is
  'Распределение выплаты (payroll_transactions kind=payout) по делам: какая часть '
  'выплаты закрывает заработок сотрудника по делу в роли lawyer|expert.';

-- ========================================================================
-- 3) RLS
-- ========================================================================

alter table public.payroll_transactions enable row level security;

-- Чтение: staff — все движения; сотрудник — только свои.
create policy payroll_transactions_select_staff
  on public.payroll_transactions for select to authenticated
  using (private.is_staff());

create policy payroll_transactions_select_own
  on public.payroll_transactions for select to authenticated
  using (user_id = (select private.active_uid()));

-- Запись (создание/правка/удаление) — только owner/admin (финансы/деструктив).
create policy payroll_transactions_write_managers
  on public.payroll_transactions for all to authenticated
  using (private.can_manage_users())
  with check (private.can_manage_users());

alter table public.payout_allocations enable row level security;

-- Чтение: staff — все; сотрудник — только аллокации своих выплат.
create policy payout_allocations_select
  on public.payout_allocations for select to authenticated
  using (
    private.is_staff()
    or exists (
      select 1 from public.payroll_transactions t
      where t.id = payout_allocations.transaction_id
        and t.user_id = (select private.active_uid())
    )
  );

-- Запись — только owner/admin (обычно через create_payout, но политику оставляем
-- для каскадного delete и согласованности).
create policy payout_allocations_write_managers
  on public.payout_allocations for all to authenticated
  using (private.can_manage_users())
  with check (private.can_manage_users());

-- ========================================================================
-- 4) payroll_employee_summary() — список сотрудников с итогами (для /reports/payroll)
-- ========================================================================
-- Per-person: начислено за дела (live, обе роли) + премии − выплаты = баланс.
-- SECURITY DEFINER + явный фильтр зрителя: staff видит всех, сотрудник — только себя.

create or replace function public.payroll_employee_summary()
returns table (
  user_id   uuid,
  full_name text,
  earned    numeric,
  bonus     numeric,
  payout    numeric,
  balance   numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with assigned as (
    select c.lawyer_id as uid,
           round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as amt
      from public.cases c
      join public.payroll_rates r on r.category = c.category
    union all
    select c.responsible_id,
           round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
  ),
  earned_agg as (
    select uid, coalesce(sum(amt), 0) as earned
      from assigned
     group by uid
  ),
  tx_agg as (
    select user_id,
           coalesce(sum(amount) filter (where kind = 'bonus'), 0)  as bonus,
           coalesce(sum(amount) filter (where kind = 'payout'), 0) as payout
      from public.payroll_transactions
     group by user_id
  )
  select
    u.id,
    u.full_name,
    coalesce(e.earned, 0)                                              as earned,
    coalesce(t.bonus, 0)                                               as bonus,
    coalesce(t.payout, 0)                                              as payout,
    coalesce(e.earned, 0) + coalesce(t.bonus, 0) - coalesce(t.payout, 0) as balance
  from public.users u
  left join earned_agg e on e.uid = u.id
  left join tx_agg t     on t.user_id = u.id
  where (private.is_staff() or u.id = (select private.active_uid()))
    and (e.uid is not null or t.user_id is not null)  -- только причастные к ЗП
  order by balance desc, u.full_name asc;
$$;

grant execute on function public.payroll_employee_summary() to authenticated;

comment on function public.payroll_employee_summary() is
  'Сводка по сотрудникам для отчёта ЗП: earned (live, обе роли) + bonus − payout = balance. '
  'SECURITY DEFINER + фильтр зрителя: staff видит всех, сотрудник — только себя.';

-- ========================================================================
-- 5) payroll_employee_cases(user_id) — разбивка по делам (для карточки сотрудника)
-- ========================================================================
-- По каждому делу сотрудника (в роли lawyer и/или expert): заработано (live),
-- выплачено (сумма аллокаций) и осталось. Включает открытые/неоплаченные дела
-- (earned может быть 0) — «над какими делами работал и работает».

create or replace function public.payroll_employee_cases(p_user_id uuid)
returns table (
  case_id      uuid,
  number_title text,
  stage        public.case_stage,
  role_in_case text,
  paid_total   numeric,
  percent      numeric,
  earned       numeric,
  paid         numeric,
  outstanding  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with buckets as (
    select c.id as case_id, c.number_title, c.stage, 'lawyer'::text as role_in_case,
           c.paid_total, coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
      from public.cases c
      join public.payroll_rates r on r.category = c.category
     where c.lawyer_id = p_user_id
    union all
    select c.id, c.number_title, c.stage, 'expert'::text,
           c.paid_total, coalesce(c.expert_rate_override, r.expert_percent)
      from public.cases c
      join public.payroll_rates r on r.category = c.category
     where c.responsible_id = p_user_id
  ),
  alloc as (
    select a.case_id, a.role_in_case, coalesce(sum(a.amount), 0) as paid
      from public.payout_allocations a
      join public.payroll_transactions t on t.id = a.transaction_id
     where t.user_id = p_user_id
     group by a.case_id, a.role_in_case
  )
  select
    b.case_id,
    b.number_title,
    b.stage,
    b.role_in_case,
    b.paid_total,
    b.percent,
    round(b.paid_total * b.percent / 100, 2)                        as earned,
    coalesce(al.paid, 0)                                            as paid,
    round(b.paid_total * b.percent / 100, 2) - coalesce(al.paid, 0) as outstanding
  from buckets b
  left join alloc al
    on al.case_id = b.case_id and al.role_in_case = b.role_in_case
  where private.is_staff() or p_user_id = (select private.active_uid())
  order by outstanding desc, b.number_title asc;
$$;

grant execute on function public.payroll_employee_cases(uuid) to authenticated;

comment on function public.payroll_employee_cases(uuid) is
  'Разбивка ЗП сотрудника по делам (роль lawyer|expert): earned (live) / paid (аллокации) '
  '/ outstanding. SECURITY DEFINER + фильтр зрителя: staff — любой user_id, иначе только свой.';

-- ========================================================================
-- 6) create_payout(...) — атомарно: выплата + распределение по делам
-- ========================================================================
-- Сумма выплаты = сумма аллокаций. Права (owner/admin) проверяет сама функция
-- через private.can_manage_users() (RLS-политики дублируют). p_allocations —
-- jsonb-массив [{case_id, role_in_case, amount}, ...].

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
  'делам (payout_allocations). Сумма = Σ аллокаций. Только owner/admin.';
