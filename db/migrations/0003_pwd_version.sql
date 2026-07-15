-- ============================================================================
-- 0003_pwd_version.sql — свой auth, сессия 2 цикла v4 (план §4.2, ревью V2)
--
-- pwd_version — версия пароля пользователя; попадает клеймом в JWT сессии.
-- getCurrentUser сравнивает клейм с колонкой (тем же единственным запросом
-- профиля): расхождение = токен выпущен ДО смены пароля → сессия
-- недействительна. Инкремент при каждой смене/выдаче пароля мгновенно
-- отзывает ВСЕ устройства пользователя — таблица сессий не нужна.
--
-- Пишет колонку только admin-пул (owner БД): в RLS-пути UPDATE users ограничен
-- политикой users_update_managed_roles (owner/admin), сам сотрудник свою
-- строку прямым UPDATE не меняет (language идёт через DEFINER set_my_language).
-- ============================================================================

alter table public.users
  add column if not exists pwd_version integer not null default 1;

comment on column public.users.pwd_version is
  'Версия пароля (клейм JWT, цикл v4). Инкремент при смене/выдаче пароля '
  'отзывает все сессии пользователя (сравнение в getCurrentUser). '
  'Пишется только admin-пулом.';

-- Колоночная модель SELECT на users (см. 0001_baseline + CLAUDE.md §5 users):
-- новые НЕприватные колонки открываются грантом явно. pwd_version читает
-- getCurrentUser под RLS (users_select_all). Секретом не является — это
-- счётчик, не пароль и не хеш.
grant select (pwd_version) on public.users to authenticated;
