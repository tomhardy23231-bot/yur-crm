-- v3 Сессия 8: каналы уведомлений пользователя (Telegram + ICS-календарь).
--
-- Отдельная таблица, а НЕ колонки в public.users: на users снят табличный SELECT
-- и выдан column-grant на безопасный список (грабля проекта, см.
-- 20260610140000_user_salary_modes.sql) — добавлять туда токены/chat_id рискованно.
--
-- Доступ — РОВНО к своей строке (RLS self). Вебхук Telegram, cron-рассылка и
-- ICS-фид работают через service_role (обход RLS) — им политики не нужны.

create table public.user_notify_channels (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- chat_id привязанного Telegram (NULL = не привязан). Заполняет вебхук по /start.
  telegram_chat_id text,
  -- одноразовый код привязки: показывается в профиле, гасится вебхуком после /start.
  telegram_link_code text unique,
  -- секрет ICS-фида (URL = аутентификация, стандарт для календарных подписок).
  calendar_token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.user_notify_channels enable row level security;

create policy notify_channels_self_select on public.user_notify_channels
  for select using (user_id = private.active_uid());
create policy notify_channels_self_insert on public.user_notify_channels
  for insert with check (user_id = private.active_uid());
create policy notify_channels_self_update on public.user_notify_channels
  for update using (user_id = private.active_uid());
create policy notify_channels_self_delete on public.user_notify_channels
  for delete using (user_id = private.active_uid());

-- Перевыпуск (и создание при первом вызове) токена ICS-фида. SECURITY INVOKER:
-- RLS-self политики выше применяются к insert/update — пользователь трогает
-- только свою строку. Случайность берётся В БД (gen_random_uuid()), не в JS.
create or replace function public.notify_reissue_calendar_token()
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_notify_channels (user_id, calendar_token)
  values (private.active_uid(), gen_random_uuid())
  on conflict (user_id) do update
    set calendar_token = gen_random_uuid(),
        updated_at = now()
  returning calendar_token;
$$;

grant execute on function public.notify_reissue_calendar_token() to authenticated;
