-- ============================================================================
-- 0011_cash_resolve_single_account.sql — единственный счёт кассы считается
-- счётом по умолчанию.
--
-- ЗАЧЕМ. private.cash_resolve_account(method) искал счёт в два шага:
--   1) активный счёт, вид которого совпал с методом (card|bank|cash);
--   2) активный счёт с галочкой is_default.
-- Если ни то, ни другое — NULL, и операция МОЛЧА не попадала в оборотку.
--
-- На проде это выстрелило дважды:
--   • 365 платежей (5 066 500 ₴) не попали в кассу — у 362 из них method пустой,
--     у остальных свободный текст («готівка», «безготівка»), а единственный
--     счёт «Моно» галочкой «за замовчуванням» не отмечен. Кнопка
--     «Синхронізувати» отвечала «Додано записів у касу: 0»;
--   • авто-расход зарплаты (0010) пишется с method IS NULL и по той же причине
--     до кассы не доходил.
--
-- ЧТО МЕНЯЕТСЯ. Добавлен третий шаг: если активный счёт в системе РОВНО ОДИН —
-- операция ложится на него. Это безопасно: пока счёт один, выбора нет вовсе.
-- Когда счетов несколько и ни один не помечен по умолчанию, функция
-- по-прежнему возвращает NULL — угадывать между «Карта» и «Готівка» нельзя.
-- ============================================================================

create or replace function private.cash_resolve_account(p_method text) returns uuid
    language sql stable security definer
    set search_path to ''
    as $$
  select coalesce(
    -- 1. Вид счёта совпал с методом операции (card | bank | cash | act→bank).
    (
      select a.id from public.cash_accounts a
       where a.is_active
         and a.kind = private.cash_kind_for_method(p_method)
       order by a.is_default desc, a.created_at asc
       limit 1
    ),
    -- 2. Счёт, отмеченный «за замовчуванням».
    (
      select a.id from public.cash_accounts a
       where a.is_active and a.is_default
       order by a.created_at asc
       limit 1
    ),
    -- 3. Единственный активный счёт — выбора всё равно нет (2026-07-26).
    (
      select a.id from public.cash_accounts a
       where a.is_active
         and (select count(*) from public.cash_accounts x where x.is_active) = 1
       limit 1
    )
  )
$$;

comment on function private.cash_resolve_account(p_method text) is
  'Счёт кассы для операции: по виду счёта (method), затем счёт по умолчанию, затем — единственный активный счёт. NULL только если счетов нет или их несколько и ни один не помечен по умолчанию. 2026-07-26 (0011).';
