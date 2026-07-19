-- 0005_notifications_seen.sql
-- Колокольчик топбара (запрос владельца 2026-07-19): попап уведомлений вместо
-- перехода на /tasks + сброс бейджа при просмотре. Храним момент последнего
-- открытия попапа; бейдж показывается, только если «момент события» самого
-- свежего горящего уведомления новее этой отметки (расчёт в TS,
-- lib/notifications/queries.ts). Таблица self-RLS (v3 Сессия 8) — политики
-- уже покрывают новую колонку, грант табличный.

alter table public.user_notify_channels
  add column if not exists notifications_seen_at timestamptz;

comment on column public.user_notify_channels.notifications_seen_at is
  'Момент последнего открытия попапа уведомлений (сброс бейджа колокольчика).';
