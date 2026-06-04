-- Двуязычный интерфейс (украинский + русский): язык интерфейса на пользователя.
-- По умолчанию — украинский. Пользователь меняет свой язык у себя в профиле;
-- выбор сохраняется здесь и зеркалится в cookie (для <html lang> и экрана входа).

alter table public.users
  add column if not exists language text not null default 'uk';

alter table public.users
  drop constraint if exists users_language_check;
alter table public.users
  add constraint users_language_check check (language in ('uk', 'ru'));

-- Безопасная смена СВОЕГО языка.
-- Прямой UPDATE на public.users под RLS не годится: политика, разрешающая менять
-- собственную строку, открыла бы и смену роли (привилегия). Поэтому — узкая
-- SECURITY DEFINER функция, которая трогает только колонку language и только
-- для текущего auth.uid().
create or replace function public.set_my_language(lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lang is null or lang not in ('uk', 'ru') then
    raise exception 'invalid language: %', lang using errcode = '22023';
  end if;

  update public.users
    set language = lang
    where id = auth.uid();
end;
$$;

revoke all on function public.set_my_language(text) from public;
grant execute on function public.set_my_language(text) to authenticated;
