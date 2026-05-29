-- Юр CRM — Леджер начислений/выплат зарплаты (P1.3) + настраиваемое начисление (P2.1).
--
-- P1.3: фиксируем начисление как ЗАПИСЬ (кому, сколько, по какому делу, когда),
--       со статусом accrued|paid. Это отдельно от payments (оплаты КЛИЕНТА).
-- P2.1: cases.accrual_mode — когда начисление попадает в леджер:
--       on_completion (по умолч.) — при переходе дела в closed;
--       per_payment             — по мере оплат (обновляется при каждом платеже).
--
-- Инвариант: на дело и роль — максимум одна строка леджера (accrued или paid).
-- Уже выплаченные (paid) строки повторной синхронизацией НЕ перезаписываются.

-- ========================================================================
-- 1) accrual_mode на деле
-- ========================================================================

create type public.accrual_mode as enum ('on_completion', 'per_payment');

alter table public.cases
  add column accrual_mode public.accrual_mode not null default 'on_completion';

comment on column public.cases.accrual_mode is
  'Когда начисление зарплаты фиксируется в payroll_ledger: on_completion (при закрытии дела) или per_payment (по мере оплат). P2.1.';

-- ========================================================================
-- 2) payroll_ledger — журнал начислений/выплат
-- ========================================================================

create table public.payroll_ledger (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete restrict,
  user_id      uuid not null references public.users(id) on delete restrict,
  role_in_case text not null check (role_in_case in ('lawyer', 'expert')),
  base_amount  numeric(14, 2) not null,  -- срез paid_total на момент начисления
  percent      numeric(5, 2)  not null,
  amount       numeric(14, 2) not null,  -- base_amount × percent / 100
  status       text not null default 'accrued' check (status in ('accrued', 'paid')),
  accrued_at   timestamptz not null default now(),
  paid_at      timestamptz,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (case_id, user_id, role_in_case)
);

create index payroll_ledger_user_idx   on public.payroll_ledger(user_id);
create index payroll_ledger_case_idx   on public.payroll_ledger(case_id);
create index payroll_ledger_status_idx on public.payroll_ledger(status);

comment on table public.payroll_ledger is
  'Журнал начислений/выплат зарплаты (P1.3). Не путать с payments (оплаты клиента). amount = base_amount × percent. status accrued|paid.';

-- ========================================================================
-- 3) Синхронизация леджера из дела
-- ========================================================================

-- Апсерт одной строки леджера (роль×дело). Обновляет существующую accrued-строку
-- (в т. ч. при изменении paid_total/ставки). НЕ трогает paid-строки. Вставляет
-- только если строки ещё нет и сумма > 0 (чтобы не плодить нулевые записи).
create or replace function private.upsert_ledger_entry(
  p_case_id uuid,
  p_user_id uuid,
  p_role    text,
  p_base    numeric,
  p_percent numeric,
  p_actor   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric(14, 2);
begin
  v_amount := round(p_base * p_percent / 100, 2);

  update public.payroll_ledger
     set base_amount = p_base,
         percent     = p_percent,
         amount      = v_amount
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
     and status = 'accrued';

  if not found
     and v_amount > 0
     and not exists (
       select 1 from public.payroll_ledger
        where case_id = p_case_id
          and user_id = p_user_id
          and role_in_case = p_role
     ) then
    insert into public.payroll_ledger
      (case_id, user_id, role_in_case, base_amount, percent, amount, created_by)
    values
      (p_case_id, p_user_id, p_role, p_base, p_percent, v_amount, p_actor);
  end if;
end;
$$;

-- Пересчёт обеих строк (юрист + Експерт) по делу, если по режиму пора начислять.
create or replace function private.sync_case_ledger(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat    public.case_category;
  v_paid   numeric(14, 2);
  v_stage  public.case_stage;
  v_mode   public.accrual_mode;
  v_lawyer uuid;
  v_expert uuid;
  v_lo     numeric(5, 2);
  v_eo     numeric(5, 2);
  v_lp     numeric(5, 2);
  v_ep     numeric(5, 2);
  v_actor  uuid;
begin
  select category, paid_total, stage, accrual_mode, lawyer_id, responsible_id,
         lawyer_rate_override, expert_rate_override
    into v_cat, v_paid, v_stage, v_mode, v_lawyer, v_expert, v_lo, v_eo
    from public.cases
   where id = p_case_id;
  if not found then
    return;
  end if;

  -- Начисляем, если режим per_payment ИЛИ дело завершено.
  if not (v_mode = 'per_payment' or v_stage = 'closed') then
    return;
  end if;

  select lawyer_percent, expert_percent
    into v_lp, v_ep
    from public.payroll_rates
   where category = v_cat;

  v_actor := auth.uid();  -- кто инициировал (может быть NULL для системных операций)

  perform private.upsert_ledger_entry(
    p_case_id, v_lawyer, 'lawyer', v_paid, coalesce(v_lo, v_lp), v_actor);
  perform private.upsert_ledger_entry(
    p_case_id, v_expert, 'expert', v_paid, coalesce(v_eo, v_ep), v_actor);
end;
$$;

create or replace function private.cases_sync_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_case_ledger(new.id);
  return null;  -- AFTER-триггер
end;
$$;

-- paid_total меняется триггером recalc_case_totals (после платежей) → ловим его.
-- stage/accrual_mode/ставки/назначения — пересчитывают начисление при правках.
create trigger cases_sync_ledger
after insert or update of
  paid_total, stage, accrual_mode,
  lawyer_rate_override, expert_rate_override, category, lawyer_id, responsible_id
on public.cases
for each row execute function private.cases_sync_ledger_trigger();

-- ========================================================================
-- 4) RLS на payroll_ledger
-- ========================================================================

alter table public.payroll_ledger enable row level security;

-- Чтение: staff видит все начисления; юрист/Експерт — только свои.
create policy payroll_ledger_select_staff
  on public.payroll_ledger
  for select
  to authenticated
  using (private.is_staff());

create policy payroll_ledger_select_own
  on public.payroll_ledger
  for select
  to authenticated
  using (user_id = (select private.active_uid()));

-- Отметка «выплачено»/откат — только owner/admin (деструктив/финансы).
-- Вставка/удаление напрямую запрещены (нет политик) — записи создаёт только
-- триггер sync_case_ledger (SECURITY DEFINER → в обход RLS).
create policy payroll_ledger_update_managers
  on public.payroll_ledger
  for update
  to authenticated
  using (private.can_manage_users())
  with check (private.can_manage_users());
