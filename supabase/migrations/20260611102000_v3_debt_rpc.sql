-- Юр CRM — v3 Сессия 9 (Продукт), часть 3: агрегаты дашборда по долгам.
--
-- Зачем (PLAN-V3 9.4): просроченные плановые доплаты и разрез дебиторки по
-- давности нигде не сводятся. Два RPC питают staff-дашборд (и Telegram-дайджест
-- юриста по его делам).
--
-- Обе функции — SECURITY INVOKER: RLS вызывающего ОБЯЗАНА работать (staff видит
-- всю компанию, юрист/Експерт — только свои дела). Поэтому агрегаты считаются
-- «по своим» автоматически, как и прочие метрики дашборда (dashboard_sources).
--
-- Типы: opened_at/closed_at/paid_at — date (см. core_tables); лишних кастов нет.

-- Просроченные позиции графика: для каждой позиции с due_date < сегодня по
-- незакрытому делу отдаём её сумму и накопленную «сумму плана до неё включительно»
-- (plan_before). TS-слой решает, реально ли позиция недооплачена
-- (paid_total < plan_before), не дублируя кумулятив глубже в SQL.
create or replace function public.overdue_plan_items(p_today date)
returns table (
  case_id uuid,
  number_title text,
  due_date date,
  amount numeric,
  paid_total numeric,
  plan_before numeric
)
language sql
security invoker
set search_path = ''
as $$
  select c.id, c.number_title, i.due_date, i.amount, c.paid_total,
         (select coalesce(sum(x.amount), 0)
            from public.payment_plan_items x
           where x.case_id = c.id
             and (x.due_date < i.due_date
                  or (x.due_date = i.due_date and x.created_at <= i.created_at)))
  from public.payment_plan_items i
  join public.cases c on c.id = i.case_id
  where i.due_date < p_today
    and c.stage <> 'closed'
  order by i.due_date
  limit 200;
$$;

grant execute on function public.overdue_plan_items(date) to authenticated;

comment on function public.overdue_plan_items(date) is
  'v3 s9: позиции графика с due_date < p_today по незакрытым делам + накопленный '
  'plan_before (сумма позиций до неё включительно) — TS решает, недооплачена ли. '
  'SECURITY INVOKER: RLS зрителя ограничивает (staff — всё, юрист/Експерт — свои).';

-- Дебиторка с разрезом по давности: незакрытые дела с долгом > 0 + дата последней
-- оплаты (или дата открытия, если оплат не было). Бакеты <30/30-60/60-90/90+
-- считаются в TS (lib/dashboard/aging.ts) от coalesce(last_paid_at, opened_at).
create or replace function public.debt_aging()
returns table (
  case_id uuid,
  number_title text,
  debt numeric,
  last_paid_at date,
  opened_at date
)
language sql
security invoker
set search_path = ''
as $$
  select c.id, c.number_title, c.debt,
         (select max(p.paid_at) from public.payments p where p.case_id = c.id),
         c.opened_at
  from public.cases c
  where c.debt > 0
    and c.stage <> 'closed'
  limit 500;
$$;

grant execute on function public.debt_aging() to authenticated;

comment on function public.debt_aging() is
  'v3 s9: незакрытые дела с debt > 0 + дата последней оплаты (или открытия). '
  'Бакеты давности считаются в TS. SECURITY INVOKER: RLS зрителя ограничивает.';
