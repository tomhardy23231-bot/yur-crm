-- Юр CRM — Закрытие протечки доступа в сводке начислений (Задача 1, важно).
--
-- Баг: public.payroll_by_specialist() — SECURITY INVOKER, поэтому RLS на cases
--   ограничивает, КАКИЕ дела попадают в выборку, но не КАКИЕ строки сводки видит
--   зритель. Для общего дела CTE attributed порождает ДВЕ строки (lawyer_id и
--   responsible_id). Дело видно юристу (он lawyer_id) → значит видна и строка
--   Експерта по этому делу: юрист узнаёт, сколько заработал Експерт. Это нарушает
--   правило «друг друга они не видят / специалист видит только свои начисления».
--
-- Сводки payroll_payout_by_specialist() и сам payroll_ledger таким не страдают:
--   они читают payroll_ledger, у которого RLS режет чужие строки (select_own).
--
-- Фикс: функция переводится на SECURITY DEFINER и САМА режет видимость —
--   staff видит всех, не-staff только свой user_id. Это надёжнее прежней опоры на
--   RLS (которая и давала протечку: для общего дела видны обе атрибуции).
--
-- Почему DEFINER, а не INVOKER+private.*: схема private закрыта от роли
--   authenticated (revoke usage), поэтому ВЫЗВАТЬ private.is_staff()/active_uid()
--   из тела SECURITY INVOKER нельзя (permission denied for schema private) — они
--   работают только внутри RLS-политик. SECURITY DEFINER выполняется от владельца
--   (есть usage на private), RLS на cases при этом не применяется, поэтому фильтр
--   зрителя реализуем здесь явно. Для специалиста суммы не меняются: он и так
--   видел только свои дела, а значит и своё начисление.
--
-- Колонки результата не меняются → create or replace (drop не требуется).

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
security definer
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
  -- Протечка (Задача 1): не-staff видит ТОЛЬКО свои строки. Staff — все.
  where private.is_staff()
     or a.uid = (select private.active_uid())
  group by a.uid, u.full_name, a.role_in_case
  order by earned desc, u.full_name asc;
$$;

grant execute on function public.payroll_by_specialist() to authenticated;

comment on function public.payroll_by_specialist() is
  'Сводка начислений по сотрудникам с эффективной per-role ставкой. SECURITY DEFINER '
  '+ явный фильтр зрителя (Задача 1): не-staff видит только свой user_id, staff — '
  'всех. Закрывает протечку, которая была при опоре на RLS (видны обе атрибуции '
  'общего дела). Совпадает по видимости с payroll_payout_by_specialist.';
