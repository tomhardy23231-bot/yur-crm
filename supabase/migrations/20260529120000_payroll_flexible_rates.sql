-- Юр CRM — Гибкие ставки зарплаты (доработки P1.1 + P1.2).
--
-- Что меняем относительно 20260528110000_payroll.sql:
--   1.2 Раздельные ставки для юриста и Експерта на уровне КАТЕГОРИИ:
--       payroll_rates.percent → lawyer_percent + expert_percent (дефолты равны).
--   1.1 Переопределение % на КОНКРЕТНОМ деле (опционально, отдельно для роли):
--       cases.lawyer_rate_override / expert_rate_override (null → ставка категории).
--   Эффективная ставка роли = coalesce(override роли, категорийный дефолт роли).
--
-- Безопасность: cases.UPDATE по RLS доступен и юристу/Експерту своего дела —
-- поэтому override-поля защищены триггером: менять их может только owner/admin
-- (private.can_manage_users()). Иначе исполнитель поднял бы себе ставку.

-- ========================================================================
-- 1.2) payroll_rates: percent → (lawyer_percent, expert_percent)
-- ========================================================================

alter table public.payroll_rates
  add column lawyer_percent numeric(5, 2)
    check (lawyer_percent >= 0 and lawyer_percent <= 100),
  add column expert_percent numeric(5, 2)
    check (expert_percent >= 0 and expert_percent <= 100);

-- Бэкфилл: исторически ставка была общей → обе роли получают её же.
update public.payroll_rates
   set lawyer_percent = percent,
       expert_percent = percent;

alter table public.payroll_rates
  alter column lawyer_percent set not null,
  alter column expert_percent set not null;

alter table public.payroll_rates drop column percent;

comment on table public.payroll_rates is
  'Ставки % зарплаты по категории, РАЗДЕЛЬНО для юриста и Експерта (дефолты равны 7/10/25). База — cases.paid_total. Редактирует owner. Переопределяется на деле через cases.*_rate_override.';

-- ========================================================================
-- 1.1) cases: per-case override % (отдельно юрист / Експерт)
-- ========================================================================

alter table public.cases
  add column lawyer_rate_override numeric(5, 2)
    check (lawyer_rate_override >= 0 and lawyer_rate_override <= 100),
  add column expert_rate_override numeric(5, 2)
    check (expert_rate_override >= 0 and expert_rate_override <= 100);

comment on column public.cases.lawyer_rate_override is
  'Индивидуальный % юриста по этому делу. NULL → ставка категории (payroll_rates.lawyer_percent). Менять может только owner/admin.';
comment on column public.cases.expert_rate_override is
  'Индивидуальный % Експерта по этому делу. NULL → ставка категории (payroll_rates.expert_percent). Менять может только owner/admin.';

-- Защита override-полей: только owner/admin (can_manage_users). Срабатывает на
-- INSERT (если override задан) и на UPDATE этих колонок.
create or replace function private.cases_guard_rate_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (new.lawyer_rate_override is not null or new.expert_rate_override is not null)
       and not private.can_manage_users() then
      raise exception 'only owner/admin may set per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.lawyer_rate_override is distinct from old.lawyer_rate_override
        or new.expert_rate_override is distinct from old.expert_rate_override)
       and not private.can_manage_users() then
      raise exception 'only owner/admin may change per-case rate overrides'
        using errcode = 'P0001', hint = 'rate_override_forbidden';
    end if;
  end if;
  return new;
end;
$$;

create trigger cases_guard_rate_overrides
before insert or update of lawyer_rate_override, expert_rate_override on public.cases
for each row execute function private.cases_guard_rate_overrides();

-- ========================================================================
-- case_payroll(case_id): теперь раздельно юрист / Експерт
-- ========================================================================
-- Меняется набор выходных колонок → требуется drop + create (не replace).

drop function if exists public.case_payroll(uuid);

create function public.case_payroll(p_case_id uuid)
returns table (
  category       public.case_category,
  lawyer_percent numeric,
  lawyer_amount  numeric,
  expert_percent numeric,
  expert_amount  numeric,
  total          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.category,
    coalesce(c.lawyer_rate_override, r.lawyer_percent)                              as lawyer_percent,
    round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2) as lawyer_amount,
    coalesce(c.expert_rate_override, r.expert_percent)                              as expert_percent,
    round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2) as expert_amount,
    round(c.paid_total * coalesce(c.lawyer_rate_override, r.lawyer_percent) / 100, 2)
      + round(c.paid_total * coalesce(c.expert_rate_override, r.expert_percent) / 100, 2) as total
  from public.cases c
  join public.payroll_rates r on r.category = c.category
  where c.id = p_case_id;
$$;

grant execute on function public.case_payroll(uuid) to authenticated;

comment on function public.case_payroll(uuid) is
  'Начисление по делу: для юриста и Експерта — эффективная ставка coalesce(override, дефолт категории) × paid_total. total = сумма обоих. SECURITY INVOKER → RLS.';

-- ========================================================================
-- payroll_by_specialist(): эффективная ставка per-role (с учётом override)
-- ========================================================================

drop function if exists public.payroll_by_specialist();

create function public.payroll_by_specialist()
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
    select
      c.lawyer_id                                       as uid,
      'lawyer'::text                                    as role_in_case,
      c.paid_total,
      coalesce(c.lawyer_rate_override, r.lawyer_percent) as percent
    from public.cases c
    join public.payroll_rates r on r.category = c.category
    union all
    select
      c.responsible_id,
      'expert'::text,
      c.paid_total,
      coalesce(c.expert_rate_override, r.expert_percent)
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
  'Сводка начислений по сотрудникам с эффективной per-role ставкой (override → дефолт категории). SECURITY INVOKER → RLS на cases.';
