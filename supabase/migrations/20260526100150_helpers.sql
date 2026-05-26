-- Юр CRM — Шаг 1, часть 3: helper-функции для RLS.
--
-- Создаются ПОСЛЕ 20260526100100_core_tables.sql, потому что используют
-- public.users и public.cases с set search_path = '' (language=sql функции
-- валидируются при CREATE, ссылка на не созданную таблицу = ошибка).
--
-- Все функции SECURITY DEFINER + STABLE + set search_path = '':
--   1) политики RLS на public.users могут вызывать их без рекурсии
--      (политика читала бы public.users → снова политика → ...);
--   2) явная квалификация всех ссылок защищает от search_path hijacking.
--
-- Все функции, читающие роль/id текущего пользователя, фильтруют по
-- `is_active = true` — деактивированный сотрудник не должен видеть/менять
-- ничего, даже если у него остался валидный auth-токен (CSO finding #1).
-- Дополнительно: при деактивации сотрудника серверный код обязан вызвать
-- supabase.auth.admin.signOut(userId), чтобы погасить активные сессии.

-- id текущего активного пользователя.
-- Возвращает auth.uid() ТОЛЬКО если в public.users есть запись с is_active = true.
-- Для деактивированного пользователя — NULL, что в SQL-сравнениях даёт false.
-- Используется в политиках вместо «голого» auth.uid().
create or replace function private.active_uid()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.users where id = auth.uid() and is_active = true
$$;

-- Роль текущего пользователя. NULL если запись отсутствует или is_active = false.
create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = auth.uid() and is_active = true
$$;

-- supervisor_id текущего активного ассистента; для остальных ролей — NULL.
create or replace function private.current_user_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select supervisor_id from public.users
   where id = auth.uid() and is_active = true
$$;

-- true для активных owner/admin (всё «staff» по матрице §4).
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role in ('owner', 'admin')
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;

-- Видимо ли указанное дело текущему пользователю?
-- Используется политиками documents/tasks/payments/activity_log,
-- чтобы не плодить EXISTS-подзапросы.
create or replace function private.can_see_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = p_case_id
      and (
        private.is_staff()
        or c.responsible_id = private.active_uid()
        or c.responsible_id = private.current_user_supervisor_id()
      )
  )
$$;

-- Может ли текущий пользователь писать в указанное дело
-- (документы/задачи/платежи)? В Phase 1 — те же права, что и видеть.
create or replace function private.can_write_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_case(p_case_id)
$$;

grant execute on function private.active_uid()                   to authenticated;
grant execute on function private.current_user_role()            to authenticated;
grant execute on function private.current_user_supervisor_id()   to authenticated;
grant execute on function private.is_staff()                     to authenticated;
grant execute on function private.can_see_case(uuid)             to authenticated;
grant execute on function private.can_write_case(uuid)           to authenticated;
