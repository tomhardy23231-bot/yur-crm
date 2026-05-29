-- Юр CRM — Новая Концепция: расчёт зарплаты в % от оплат по делу.
--
-- Модель (подтверждено клиентом):
--   - % зависит от КАТЕГОРИИ дела: документ 7%, иск 10%, представительство 25%.
--   - База расчёта — ОПЛАЧЕННАЯ сумма по делу (cases.paid_total), не сумма договора.
--   - КАЖДЫЙ из двоих — юрист (lawyer_id, продажник) и Експерт (responsible_id,
--     исполнитель) — получает ПОЛНЫЙ категорийный %. Итого по делу = 2× per_specialist.
--   - Проценты редактирует только owner (системная настройка).
--   - «Начисление» при закрытии дела в этой фазе — это та же live-сумма
--     (paid_total уже не меняется). Отдельный леджер выплат отложен на Phase 2.

-- ========================================================================
-- 1) payroll_rates — ставки % по категории (owner-editable)
-- ========================================================================

create table public.payroll_rates (
  category   public.case_category primary key,
  percent    numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  updated_at timestamptz not null default now()
);

insert into public.payroll_rates (category, percent) values
  ('document', 7),
  ('claim', 10),
  ('representation', 25);

comment on table public.payroll_rates is
  '% зарплаты по категории дела (новая Концепция). База — cases.paid_total. Редактирует owner.';

alter table public.payroll_rates enable row level security;

-- Чтение — staff (для отображения начислений в карточке/отчётах).
create policy payroll_rates_select_staff
  on public.payroll_rates
  for select
  to authenticated
  using (private.is_staff());

-- Чтение также нужно юристу/Експерту, чтобы видеть свои начисления по делу.
create policy payroll_rates_select_assignees
  on public.payroll_rates
  for select
  to authenticated
  using ((select private.active_uid()) is not null);

-- Запись (изменение ставок) — только owner (системная настройка).
create policy payroll_rates_write_owner
  on public.payroll_rates
  for all
  to authenticated
  using (private.is_owner())
  with check (private.is_owner());

-- ========================================================================
-- 2) case_payroll(case_id) — начисление по конкретному делу
-- ========================================================================
-- SECURITY INVOKER → RLS на public.cases применяется: вызвать сможет только
-- тот, кто видит дело (staff / его юрист / его Експерт).

create or replace function public.case_payroll(p_case_id uuid)
returns table (
  category       public.case_category,
  percent        numeric,
  per_specialist numeric,
  total          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.category,
    r.percent,
    round(c.paid_total * r.percent / 100, 2)        as per_specialist,
    round(c.paid_total * r.percent / 100, 2) * 2     as total
  from public.cases c
  join public.payroll_rates r on r.category = c.category
  where c.id = p_case_id;
$$;

grant execute on function public.case_payroll(uuid) to authenticated;

comment on function public.case_payroll(uuid) is
  'Начисление зарплаты по делу: per_specialist = paid_total × %; total = 2× (юрист + Експерт). SECURITY INVOKER → RLS.';

-- ========================================================================
-- 3) payroll_by_specialist() — сводка по сотрудникам (отчёт)
-- ========================================================================
-- Атрибутирует начисление и юристу, и Експерту. RLS на cases ограничивает
-- строки: staff видит всех, юрист/Експерт — только свои дела (→ свою строку).
-- Разбивка по role_in_case (lawyer|expert): сотрудник, бывший и юристом, и
-- Експертом на разных делах, увидит две строки.

create or replace function public.payroll_by_specialist()
returns table (
  user_id      uuid,
  full_name    text,
  role_in_case text,
  case_count   bigint,
  paid_base    numeric,
  earned       numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with attributed as (
    select c.lawyer_id as uid, 'lawyer'::text as role_in_case, c.paid_total, r.percent
      from public.cases c
      join public.payroll_rates r on r.category = c.category
    union all
    select c.responsible_id as uid, 'expert'::text as role_in_case, c.paid_total, r.percent
      from public.cases c
      join public.payroll_rates r on r.category = c.category
  )
  select
    a.uid                                                       as user_id,
    u.full_name,
    a.role_in_case,
    count(*)                                                    as case_count,
    coalesce(sum(a.paid_total), 0)                              as paid_base,
    coalesce(sum(round(a.paid_total * a.percent / 100, 2)), 0)  as earned
  from attributed a
  join public.users u on u.id = a.uid
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;

grant execute on function public.payroll_by_specialist() to authenticated;

comment on function public.payroll_by_specialist() is
  'Сводка начислений по сотрудникам (роль в деле lawyer|expert). SECURITY INVOKER → RLS на cases ограничивает видимость.';
