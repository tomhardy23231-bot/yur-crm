-- Юр CRM — Комментарии к делу (заметки сотрудников на карточке дела).
--
-- Отдельная сущность рядом с задачами: свободный текст + автор + время. Нужна
-- для рабочих заметок по делу, которых раньше не было (только задачи).
--
-- Доступ наследуется от дела через private.can_see_case / private.can_write_case
-- (точно как tasks/documents/payments, RLS-миграция 20260526100200).
--
-- В activity_log НЕ пишем: комментарий самодокументируется (автор + время видны
-- в блоке), а расширять security-critical allowlist log_activity (CSO #1) ради
-- этого не требуется. Редактирование в Phase 1 не делаем — только добавить/удалить.

create table public.case_comments (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  author_id  uuid not null references public.users(id) on delete restrict,
  body       text not null,
  created_at timestamptz not null default now(),

  -- Не пустой и в разумных пределах (защита от пустого сабмита и спама).
  constraint case_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint case_comments_body_max       check (length(body) <= 5000)
);

create index case_comments_case_idx on public.case_comments(case_id, created_at desc);

comment on table public.case_comments is
  'Комментарии (заметки) сотрудников к делу. Доступ наследуется от дела (RLS).';

-- =====================================================================
-- RLS — зеркало tasks (наследование доступа от дела):
--   SELECT — кто видит дело (can_see_case);
--   INSERT — кто пишет в дело (can_write_case) + author_id = свой active_uid
--            (нельзя приписать комментарий чужому пользователю — CSO #2);
--   DELETE — автор своей записи ИЛИ owner/admin (can_manage_users).
--   UPDATE — политики НЕТ: комментарии неизменяемы в Phase 1.
-- =====================================================================

alter table public.case_comments enable row level security;

create policy case_comments_select_via_case
  on public.case_comments
  for select
  to authenticated
  using (private.can_see_case(case_id));

create policy case_comments_insert_via_case
  on public.case_comments
  for insert
  to authenticated
  with check (
    private.can_write_case(case_id)
    and author_id = (select private.active_uid())
  );

create policy case_comments_delete_author_or_managers
  on public.case_comments
  for delete
  to authenticated
  using (
    author_id = (select private.active_uid())
    or private.can_manage_users()
  );
