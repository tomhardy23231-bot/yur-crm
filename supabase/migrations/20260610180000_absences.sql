-- Юр CRM — v2 Этап 6: Отпуска / отсутствия (absences). docs/PLAN-V2.md, Этап 6.
--
-- Модель доступа (CLAUDE.md §4–§5, PLAN-V2 §6) — РОЛЕВАЯ, не по cap'у (в отличие
-- от payroll_user_visible, завязанного на право view_all_payroll):
--   • чтение:  сам сотрудник · owner · admin/office_manager своего подразделения
--              (либо безлимитный scope: visibility_scope='all' / department NULL —
--              переходное правило, уже гейтнуто ролью внутри private.scope_is_all());
--   • запись (INSERT): сам сотрудник · owner · admin своего подразделения (либо
--              all/NULL). office_manager СЮДА НЕ попадает — он отсутствия только
--              читает (PLAN-V2 §6);
--   • удаление: те же, кто пишет (owner/admin-подразделение/сам по своему user_id),
--              ИЛИ автор записи (created_by) — сотрудник вправе снять отпуск, который
--              сам внёс. UPDATE-политики НЕТ (правка = удалить + создать заново).
--
-- Отпуск «принадлежит» сотруднику (user_id); его подразделение определяет, кто из
-- руководителей его видит/правит — ровно как дело по подразделению юриста/Експерта
-- (private.case_visible). Здесь субъект один (user_id), поэтому отдельные предикаты.
--
-- Миграция АДДИТИВНАЯ: новая таблица + 2 private-предиката. activity_log НЕ трогаем
-- (отпуска — не «по делам»; DoD Этапа 6 логирование не требует) → гоча allowlist
-- 23514 не задевается. entity_type 'user' уже в allowlist, если позже захотим логировать.
--
-- Откат: drop table public.absences; drop function private.absence_user_visible(uuid),
-- private.absence_can_write(uuid). Существующие данные миграция не трогает.

-- ========================================================================
-- 1) Таблица absences
-- ========================================================================
create table public.absences (
  id          uuid primary key default gen_random_uuid(),
  -- CASCADE: жёсткое удаление пользователя (редко — обычно is_active=false) уносит
  -- его отсутствия. created_by — RESTRICT (как payments/case_acts): автор-сотрудник
  -- не теряется молча; тестовая чистка снимает absences до удаления пользователей.
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null default 'vacation',
  starts_on   date not null,
  ends_on     date not null,
  note        text,
  created_by  uuid not null references public.users(id) on delete restrict,
  created_at  timestamptz not null default now(),

  constraint absences_kind_valid  check (kind in ('vacation', 'sick', 'other')),
  constraint absences_range_valid check (ends_on >= starts_on),
  constraint absences_note_len    check (note is null or char_length(note) <= 500)
);

-- Выборка по сотруднику (карточка) и по диапазону дат (календарь).
create index absences_user_idx  on public.absences(user_id);
create index absences_range_idx on public.absences(starts_on, ends_on);

comment on table public.absences is
  'Отпуска/отсутствия сотрудника: kind (vacation|sick|other), период starts_on…ends_on. '
  'Видимость по подразделению сотрудника (как дела). v2 Этап 6.';

-- ========================================================================
-- 2) Предикаты доступа (схема private, SECURITY DEFINER + search_path='')
-- ========================================================================
-- 2.1 Чтение: сам · owner · admin/office_manager (своё подразделение либо
-- безлимитный scope). private.scope_is_all() сам по себе гейтнут ролью
-- (admin/office_manager) — для lawyer/expert вернёт false, поэтому они видят
-- только свои отсутствия (ветка p_user_id = active_uid()).
create or replace function private.absence_user_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = private.active_uid()
    or private.is_owner()
    or private.scope_is_all()
    or (
      private.current_user_role() in ('admin', 'office_manager')
      and exists (
        select 1
          from public.users u
         where u.id = p_user_id
           and u.department_id is not null
           and u.department_id = private.current_user_department()
      )
    )
$$;

-- 2.2 Запись/удаление руководителем: сам · owner · admin своего подразделения
-- (либо all/NULL). Внешний гейт current_user_role()='admin' отсекает office_manager:
-- private.scope_is_all() возвращает true и для office_manager, но он сюда не пройдёт
-- (читать отсутствия office_manager может, писать — нет, PLAN-V2 §6).
create or replace function private.absence_can_write(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = private.active_uid()
    or private.is_owner()
    or (
      private.current_user_role() = 'admin'
      and (
        private.scope_is_all()
        or exists (
          select 1
            from public.users u
           where u.id = p_user_id
             and u.department_id is not null
             and u.department_id = private.current_user_department()
        )
      )
    )
$$;

grant execute on function private.absence_user_visible(uuid) to authenticated;
grant execute on function private.absence_can_write(uuid)    to authenticated;

-- ========================================================================
-- 3) RLS
-- ========================================================================
alter table public.absences enable row level security;

-- SELECT — по подразделению сотрудника (см. absence_user_visible).
create policy absences_select
  on public.absences
  for select
  to authenticated
  using (private.absence_user_visible(user_id));

-- INSERT — автор обязан быть текущим активным пользователем И иметь право записи
-- на этого сотрудника (сам / owner / admin-подразделение).
create policy absences_insert
  on public.absences
  for insert
  to authenticated
  with check (
    created_by = (select private.active_uid())
    and private.absence_can_write(user_id)
  );

-- DELETE — кто вправе писать ИЛИ автор записи (сотрудник может снять свой отпуск).
create policy absences_delete
  on public.absences
  for delete
  to authenticated
  using (
    private.absence_can_write(user_id)
    or created_by = (select private.active_uid())
  );

-- UPDATE-политики НЕТ намеренно (default-deny): правка отпуска = удалить + создать.
