-- Юр CRM — Шаг 1: Row Level Security строго по матрице доступа CLAUDE.md §4.
--
-- Принципы:
--   - service_role обходит RLS (документ. поведение Supabase) → используем
--     только для миграций, сида и системных задач (CLAUDE.md §2).
--   - Все user-facing запросы идут через authenticated.
--   - Где «owner/admin видят всё» — используем private.is_staff().
--   - Везде, где сравниваем «своё», используем private.active_uid() вместо auth.uid():
--     для is_active = false пользователей оно возвращает NULL → все ветки сравнения
--     дают false → деактивированный сотрудник отрезан от данных (CSO finding #1).
--   - INSERT-политики с колонкой автора (created_by/uploaded_by) требуют
--     совпадения с private.active_uid() — нельзя приписать действие чужому
--     пользователю (CSO finding #2). Если staff нужно создать «от имени» —
--     делается через серверный action с service_role и записью в activity_log.
--   - documents/tasks/payments наследуют доступ от дела через private.can_see_case().
--   - activity_log: чтение по видимым делам; запись из триггеров/serverless через
--     service_role (отдельной insert-политики НЕ даём).
--
-- Производительность: (select private.active_uid()) обёрнуто в SELECT —
-- Postgres вычислит функцию один раз на запрос, а не на каждую строку
-- (рекомендация Supabase RLS performance guide).

-- =====================================================================
-- Включаем RLS на все public-таблицы
-- =====================================================================

alter table public.users        enable row level security;
alter table public.clients      enable row level security;
alter table public.cases        enable row level security;
alter table public.documents    enable row level security;
alter table public.tasks        enable row level security;
alter table public.payments     enable row level security;
alter table public.activity_log enable row level security;

-- =====================================================================
-- users
-- =====================================================================
-- SELECT: любой АКТИВНЫЙ авторизованный (имена ответственных, выбор assignee).
--         Деактивированных В СПИСКЕ видно (нужно для исторических записей),
--         но самим деактивированным таблица недоступна (least access для уволенных).
-- INSERT/UPDATE/DELETE: owner + admin (управление пользователями — новая Концепция).

create policy users_select_all
  on public.users
  for select
  to authenticated
  using ((select private.active_uid()) is not null);

create policy users_insert_managers
  on public.users
  for insert
  to authenticated
  with check (private.can_manage_users());

create policy users_update_managers
  on public.users
  for update
  to authenticated
  using      (private.can_manage_users())
  with check (private.can_manage_users());

create policy users_delete_managers
  on public.users
  for delete
  to authenticated
  using (private.can_manage_users());

-- =====================================================================
-- cases
-- =====================================================================
-- SELECT: staff (owner/admin/office_manager) — всё; lawyer — где lawyer_id = uid;
--         expert — где responsible_id = uid.
-- INSERT: staff (дело заводит секретарь/админ/владелец).
-- UPDATE: staff + юрист/Експерт по своим делам (stage валидируется триггером).
-- DELETE: owner/admin (офис-менеджер дела не удаляет).

create policy cases_select_visible
  on public.cases
  for select
  to authenticated
  using (
    private.is_staff()
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  );

create policy cases_insert_staff
  on public.cases
  for insert
  to authenticated
  with check (private.is_staff());

create policy cases_update_staff_or_assignee
  on public.cases
  for update
  to authenticated
  using (
    private.is_staff()
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  )
  with check (
    private.is_staff()
    or lawyer_id = (select private.active_uid())
    or responsible_id = (select private.active_uid())
  );

create policy cases_delete_managers
  on public.cases
  for delete
  to authenticated
  using (private.can_manage_users());

-- =====================================================================
-- clients
-- =====================================================================
-- SELECT: staff — все; иначе — клиенты, у которых есть видимое дело
--         (где пользователь lawyer_id или responsible_id).
-- INSERT: любой активный сотрудник; created_by обязан = текущему активному uid
--         (запрет на приписывание создания чужому пользователю).
-- UPDATE: staff + автор записи.
-- DELETE: owner/admin (FK on cases.client_id = RESTRICT защищает от каскада).

create policy clients_select_visible
  on public.clients
  for select
  to authenticated
  using (
    private.is_staff()
    or exists (
      select 1 from public.cases c
      where c.client_id = clients.id
        and (
          c.lawyer_id = (select private.active_uid())
          or c.responsible_id = (select private.active_uid())
        )
    )
  );

create policy clients_insert_active
  on public.clients
  for insert
  to authenticated
  with check (
    (select private.active_uid()) is not null
    and created_by = (select private.active_uid())
  );

create policy clients_update_staff_or_creator
  on public.clients
  for update
  to authenticated
  using (
    private.is_staff()
    or created_by = (select private.active_uid())
  )
  with check (
    private.is_staff()
    or created_by = (select private.active_uid())
  );

create policy clients_delete_managers
  on public.clients
  for delete
  to authenticated
  using (private.can_manage_users());

-- =====================================================================
-- documents / tasks / payments — наследуют доступ от дела
-- =====================================================================

-- documents -----------------------------------------------------------

create policy documents_select_via_case
  on public.documents
  for select
  to authenticated
  using (private.can_see_case(case_id));

create policy documents_insert_via_case
  on public.documents
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and uploaded_by = (select private.active_uid())
  );

create policy documents_update_via_case
  on public.documents
  for update
  to authenticated
  using      (private.can_write_case(case_id))
  with check (private.can_write_case(case_id));

create policy documents_delete_managers
  on public.documents
  for delete
  to authenticated
  using (private.can_manage_users());

-- tasks ---------------------------------------------------------------

create policy tasks_select_via_case
  on public.tasks
  for select
  to authenticated
  using (private.can_see_case(case_id));

create policy tasks_insert_via_case
  on public.tasks
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and created_by = (select private.active_uid())
  );

create policy tasks_update_via_case
  on public.tasks
  for update
  to authenticated
  using      (private.can_write_case(case_id))
  with check (private.can_write_case(case_id));

create policy tasks_delete_via_case
  on public.tasks
  for delete
  to authenticated
  using (private.can_write_case(case_id));

-- payments ------------------------------------------------------------
-- Чтение: staff (incl. office_manager — видит все финансы) + юрист/Експерт
--         по своему делу.
-- INSERT: те же, кто видит дело (юрист «вносит данные об оплате»);
--         created_by = active_uid (нет «платил кто-то другой»).
-- UPDATE/DELETE: owner/admin (исправление платежа = админская операция;
--         офис-менеджер финансы только читает).

create policy payments_select_via_case
  on public.payments
  for select
  to authenticated
  using (private.can_see_case(case_id));

create policy payments_insert_via_case
  on public.payments
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and created_by = (select private.active_uid())
  );

create policy payments_update_managers
  on public.payments
  for update
  to authenticated
  using      (private.can_manage_users())
  with check (private.can_manage_users());

create policy payments_delete_managers
  on public.payments
  for delete
  to authenticated
  using (private.can_manage_users());

-- =====================================================================
-- activity_log
-- =====================================================================
-- SELECT: owner/admin — всё; остальные — только записи по видимым делам
--         (entity_type='case'). Записи по другим сущностям видны только staff —
--         так нет утечки имён клиентов/документов через лог.
--
-- INSERT/UPDATE/DELETE: НЕТ user-политик → запись возможна только через
-- service_role (серверные действия, триггеры). Это намеренно: журнал должен быть
-- append-only и не подделываемым со стороны клиента.

create policy activity_log_select_visible
  on public.activity_log
  for select
  to authenticated
  using (
    private.is_staff()
    or (
      entity_type = 'case'
      and private.can_see_case(entity_id)
    )
  );
