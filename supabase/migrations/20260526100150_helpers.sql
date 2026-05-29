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

-- true для активных owner/admin/office_manager — «staff» по матрице §4
-- (видят все дела, всех клиентов и все финансы).
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role in ('owner', 'admin', 'office_manager')
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;

-- true только для активного owner — системные настройки (ставки зарплаты и т. п.).
create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'owner'
       from public.users
      where id = auth.uid() and is_active = true),
    false
  )
$$;

-- true для активных owner/admin — управление пользователями и их правами,
-- а также деструктивные операции (удаление, правка платежей). Офис-менеджер
-- финансы ЧИТАЕТ (is_staff), но удалять/править их не может.
create or replace function private.can_manage_users()
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
        or c.lawyer_id = private.active_uid()       -- юрист видит свои заключённые дела
        or c.responsible_id = private.active_uid()  -- Експерт видит свои ведомые дела
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
grant execute on function private.is_staff()                     to authenticated;
grant execute on function private.is_owner()                     to authenticated;
grant execute on function private.can_manage_users()             to authenticated;
grant execute on function private.can_see_case(uuid)             to authenticated;
grant execute on function private.can_write_case(uuid)           to authenticated;
