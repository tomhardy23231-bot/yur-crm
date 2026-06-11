-- Юр CRM — v3 Сессия 4: hoisting RLS-предиката cases (docs/PLAN-V3.md, 4.7).
--
-- Зачем: политики cases звали private.case_visible(lawyer_id, responsible_id) НА
-- КАЖДУЮ строку — а внутри ещё can_see_all_cases()/active_uid()/can()/department.
-- Postgres не может вынести вызов с per-row аргументами в initplan. Раскрываем
-- предикат в политике так, чтобы НЕзависящие от строки части (can_see_all_cases,
-- active_uid) обернуть в (select …) — планировщик вычислит их ОДИН раз (initplan),
-- а не на каждую строку. Зависящая от строки департаментная ветка вынесена в
-- private.case_dept_visible(lawyer, responsible) — зовётся per-row, но только когда
-- более дешёвые ветки не сработали (специалист по своему делу короткозамыкает её).
--
-- СЕМАНТИКА НЕ МЕНЯЕТСЯ: раскрытая форма точно повторяет private.case_visible
-- (can_see_all_cases OR ты юрист/Эксперт OR департаментная ветка). Это чисто
-- планировочная оптимизация — выдача RLS идентична. case_visible НЕ трогаем: его
-- продолжают звать can_see_case (documents/tasks/payments/...), там аргументы и так
-- из подзапроса по одному делу.
--
-- Откат: восстановить политики cases_select_visible / cases_update_staff_or_assignee
-- из 20260610110000 (using private.case_visible(...)) и удалить private.case_dept_visible.

-- Департаментная ветка case_visible как отдельный предикат (без «видит всё» и без
-- «свои дела» — те ветки раскрыты прямо в политике и хоистятся).
create or replace function private.case_dept_visible(p_lawyer uuid, p_responsible uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can('view_all_cases')
     and exists (
       select 1
         from public.users u
        where u.id in (p_lawyer, p_responsible)
          and u.department_id is not null
          and u.department_id = private.current_user_department()
     )
$$;

grant execute on function private.case_dept_visible(uuid, uuid) to authenticated;

-- SELECT — раскрытый case_visible с хоистингом скалярных веток.
drop policy if exists cases_select_visible on public.cases;
create policy cases_select_visible
  on public.cases
  for select
  to authenticated
  using (
    (select private.can_see_all_cases())
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
    or private.case_dept_visible(lawyer_id, responsible_id)
  );

-- UPDATE — тот же раскрытый предикат (using + with check), идентично прежнему.
drop policy if exists cases_update_staff_or_assignee on public.cases;
create policy cases_update_staff_or_assignee
  on public.cases
  for update
  to authenticated
  using (
    (select private.can_see_all_cases())
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
    or private.case_dept_visible(lawyer_id, responsible_id)
  )
  with check (
    (select private.can_see_all_cases())
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
    or private.case_dept_visible(lawyer_id, responsible_id)
  );
