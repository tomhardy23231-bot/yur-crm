-- supabase/seed.sql — ЛОКАЛЬНЫЙ seed (выполняется на `supabase db reset` и
-- `supabase start`). НЕ выполняется при `supabase db push` на прод — там гранты
-- ставит платформа Supabase. Содержит ТОЛЬКО восстановление грантов; пользователей
-- и кассу создаёт TS-скрипт scripts/seed.ts (`npm run db:seed`).
--
-- Назначение (v3 Сессия 12): чинит известную граблю Supabase CLI 2.106.0 — при
-- локальном `db reset` платформенный bootstrap DML-грантов НЕ отрабатывает, и все
-- public-таблицы остаются без SELECT/INSERT/UPDATE/DELETE для anon/authenticated/
-- service_role → seed.ts и integration-тесты падают с «permission denied for table …».
-- Раньше чинилось разовым psql после каждого reset (см. reset_grants memory); теперь —
-- здесь, идемпотентно, на каждый reset.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Переприменяем колоночную приватность users (зеркало миграции
-- 20260610140000_user_salary_modes.sql): широкий grant выше вернул бы SELECT на
-- salary_*-колонки, поэтому снимаем табличный SELECT у authenticated/anon и отдаём
-- только безопасный список колонок. ⚠ Список ДОЛЖЕН совпадать с миграцией — при
-- добавлении колонок в public.users синхронизировать оба места.
revoke select on public.users from authenticated, anon;
grant select (
  id, full_name, email, role, is_active, created_at,
  perm_overrides, language, department_id, position, visibility_scope
) on public.users to authenticated, anon;
