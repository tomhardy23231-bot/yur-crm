-- Юр CRM — Задача 1: юрист может завести клиента без сырой RLS-ошибки.
--
-- Проблема: createClientAction делает INSERT ... RETURNING (PostgREST .select()).
--   Сам INSERT проходит (clients_insert_active пускает любого активного), но
--   RETURNING-чтение прогоняется через clients_select_visible, которая показывает
--   клиента ТОЛЬКО staff'у или тому, у кого есть видимое дело по этому клиенту.
--   У только что созданного клиента дел ещё нет → создатель (lawyer) не может
--   прочитать свою же строку → сырая ошибка «new row violates row-level security
--   policy for table "clients"». Клиент при этом фактически не сохраняется в UX
--   (action возвращает ошибку и не редиректит).
--
-- Чиним двумя правками RLS (схему clients не трогаем — created_by уже есть):
--   1) SELECT: добавляем ветку «создатель видит своего клиента»
--      (created_by = active_uid()) — по образцу clients_update_staff_or_creator.
--      Теперь RETURNING сразу после INSERT отдаёт строку создателю.
--   2) INSERT: ограничиваем круг создателей. По §4 клиентов заводят
--      owner/admin/office_manager и lawyer (продажник). Експерт работает только
--      по назначенным делам и НЕ создаёт сущностей → его из INSERT убираем.
--
-- RLS не ослабляется: SELECT-ветка ограничена собственными записями создателя
-- (не «все клиенты»), INSERT — наоборот, ужесточается (минус роль expert).

-- ========================================================================
-- 1) private.can_create_clients() — кто вправе заводить клиентов
-- ========================================================================
-- Активные owner/admin/office_manager/lawyer. expert исключён намеренно.
create or replace function private.can_create_clients()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role in ('owner', 'admin', 'office_manager', 'lawyer')
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;

grant execute on function private.can_create_clients() to authenticated;

comment on function private.can_create_clients() is
  'Задача 1: кто вправе создавать клиентов — активные owner/admin/office_manager/'
  'lawyer. Експерт исключён (работает только по назначенным делам).';

-- ========================================================================
-- 2) SELECT: создатель видит своего клиента (даже без связанного дела)
-- ========================================================================
drop policy if exists clients_select_visible on public.clients;
create policy clients_select_visible
  on public.clients
  for select
  to authenticated
  using (
    private.is_staff()
    or created_by = (select private.active_uid())
    or exists (
      select 1 from public.cases c
      where c.client_id = clients.id
        and (
          c.lawyer_id = (select private.active_uid())
          or c.responsible_id = (select private.active_uid())
        )
    )
  );

-- ========================================================================
-- 3) INSERT: только разрешённые роли + нельзя приписать создание чужому
-- ========================================================================
drop policy if exists clients_insert_active on public.clients;
create policy clients_insert_creators
  on public.clients
  for insert
  to authenticated
  with check (
    private.can_create_clients()
    and created_by = (select private.active_uid())
  );
