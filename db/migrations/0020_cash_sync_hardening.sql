-- ============================================================================
-- 0020_cash_sync_hardening.sql — две дыры в пересинхронизации зеркал кассы,
-- найденные адверсариальным ревью 0019 (2026-08-04) ПЕРЕД выкаткой на прод.
--
-- Обе живут в триггерах `cash_sync_on_payment` / `cash_sync_on_expense`, и обе
-- стали достижимы именно сейчас: до 0019 у `expenses` не было UPDATE-политики
-- вовсе, то есть ветка `tg_op = 'UPDATE'` для расходов из приложения не
-- вызывалась НИКОГДА.
--
--   A. ГОНКА ПРИ ПЕРЕНОСЕ ФЛАГА. 0019 переносит include_before_opening на
--      пересозданную строку так: `select … into v_incl` → `delete` → `insert`.
--      Между select и delete строку успевает изменить чужая транзакция
--      (READ COMMITTED, никакой блокировки на select нет): владелец включил
--      операцию в оборот, юрист в ту же секунду поправил комментарий платежа —
--      insert положит coalesce(v_incl,false) = false, и деньги молча выпадут
--      из оборотов обратно. Лечится одним стейтментом: `delete … returning`
--      читает и блокирует строку в один заход.
--
--   B. СТАЛАЯ СТРОКА КАССЫ. Если счёт списания не резолвится (счёт, на который
--      ссылался method, деактивировали; дефолтного нет; активных больше одного),
--      триггер выходит ДО удаления зеркала — «не удаляем прежнюю строку, если
--      новую положить некуда». Для INSERT это правильно. Для UPDATE — нет:
--      расход уже стал 5 000 ₴, а в кассе навсегда осталось 500 ₴, и никакой
--      ошибки пользователь не видит. Правка молча разводит отчёты
--      (`expenses_by_category`, `finance_by_case`) с кассой.
--      Решение: на UPDATE зеркало СНИМАЕМ. Расход без резолвимого счёта не
--      попадает в кассу — ровно как расход, заведённый когда счетов не было.
--      Лучше отсутствие строки, чем строка с неверной суммой.
-- ============================================================================

create or replace function private.cash_sync_on_payment() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_desc    text;
  v_incl    boolean := false;
begin
  -- РЕЗОЛВИМ счёт ПЕРВЫМ — и только потом трогаем cash_entries. Иначе на INSERT,
  -- если у платежа метод без счёта (method=NULL и нет дефолтного счёта), мы бы
  -- удалили прежнюю авто-строку и НЕ создали новую → молчаливая потеря прихода
  -- (находка адвер-ревью HIGH). Резолв до DELETE гарантирует: строку удаляем,
  -- только если есть куда переложить приход.
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));

  if v_account is null then
    if tg_op = 'UPDATE' then
      -- Класть некуда, но прежняя строка описывает УЖЕ НЕВЕРНЫЕ сумму/дату.
      -- Снимаем её: платёж останется вне кассы (как при заведении без счетов),
      -- зато оборотка не будет показывать старые цифры как текущие (0020).
      delete from public.cash_entries where payment_id = new.id;
    end if;
    -- INSERT: платёж проходит, строки кассы просто нет (триггер не падает).
    return null;
  end if;

  -- Счёт известен. На UPDATE пересоздаём строку (сумма/дата/счёт могли
  -- смениться), унося с собой ручное «внести в оборот». delete … returning
  -- читает флаг и блокирует строку одним стейтментом — без окна для гонки.
  if tg_op = 'UPDATE' then
    delete from public.cash_entries
     where payment_id = new.id
    returning include_before_opening into v_incl;
  end if;

  select number_title into v_title from public.cases where id = new.case_id;
  v_desc := coalesce(
    nullif(btrim(new.note), ''),
    'Оплата по справі' || coalesce(': ' || v_title, '')
  );

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id,
     created_by, include_before_opening)
  values
    (v_account, new.paid_at, 'in', new.amount, left(v_desc, 300), new.case_id, new.id,
     new.created_by, coalesce(v_incl, false));

  return null;
end;
$$;

comment on function private.cash_sync_on_payment() is
  'Зеркалит платёж по делу в кассу строкой Надходження. Счёт: payments.account_id, иначе подбор cash_resolve_account(method). Нет счетов → на INSERT платёж сохраняется без строки кассы, на UPDATE прежняя строка СНИМАЕТСЯ (не врать старой суммой). На UPDATE пересоздаёт строку, сохраняя include_before_opening через delete…returning (без гонки). 2026-08-04 (0020).';

create or replace function private.cash_sync_on_expense() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_cat     text;
  v_desc    text;
  v_incl    boolean := false;
begin
  -- 1) Явно выбранный счёт; 2) подбор по виду/по умолчанию (старое поведение).
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));

  if v_account is null then
    if tg_op = 'UPDATE' then
      -- См. комментарий-близнец в cash_sync_on_payment: старая строка врала бы
      -- о сумме расхода, а пользователь видел бы «Расход изменён» (0020).
      delete from public.cash_entries where expense_id = new.id;
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.cash_entries
     where expense_id = new.id
    returning include_before_opening into v_incl;
  end if;

  if new.case_id is not null then
    select number_title into v_title from public.cases where id = new.case_id;
  end if;

  select coalesce(nullif(btrim(name), ''), code) into v_cat
    from public.expense_categories where id = new.category_id;

  v_desc := coalesce(v_cat, 'Витрата')
         || coalesce(' · ' || nullif(btrim(new.note), ''), '')
         || coalesce(' — ' || v_title, '');

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, expense_id,
     created_by, include_before_opening)
  values
    (v_account, new.spent_at, 'out', new.amount, left(v_desc, 300), new.case_id, new.id,
     new.created_by, coalesce(v_incl, false));

  return null;
end;
$$;

comment on function private.cash_sync_on_expense() is
  'Зеркалит расход (public.expenses) в кассу строкой Розхід. Счёт: expenses.account_id, иначе подбор cash_resolve_account(method). Нет счёта → на INSERT расход сохраняется без строки кассы, на UPDATE прежняя строка СНИМАЕТСЯ (не врать старой суммой). На UPDATE пересоздаёт строку, сохраняя include_before_opening через delete…returning (без гонки). 2026-08-04 (0020).';

-- Комментарий функции журнала: CREATE OR REPLACE в 0019 его не перезаписал,
-- и в БД он до сих пор рекламировал allowlist версии 0014.
comment on function public.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_changes jsonb) is
  'Пишет запись в public.activity_log под текущим пользователем. Allowlist действий продублирован внутри (0019: +expense_updated); прежний список сохраняется ЦЕЛИКОМ — иначе прод-миграция падает 23514. Скоуп по entity_type: case — can_see_case, cash — can_manage_cash, user — manage_users (кроме смены своего пароля), department/org — owner, absence — absence_can_write. Ошибки логирования не ломают основную операцию (exception → pg_notify). 2026-08-04 (0020).';

-- ── Сводка отсечённых операций по счёту ─────────────────────────────────────
-- Плашка «операции раньше даты начального остатка» до сих пор считала их по
-- ВИДИМОМУ ПЕРИОДУ, а кнопка меняет настройку счёта — глобальную и навсегда.
-- Из-за этого в августе предлагалось перенести дату на 02.08, хотя отсечённые
-- операции есть ещё и в апреле, и о них никто не говорил. Функция отдаёт
-- картину по всему счёту: сколько операций, на какую сумму и с какой даты.
-- Она же питает подтверждение перед переносом — владелец видит цифры ДО клика.
create function public.cash_cutoff_summary()
    returns table(account_id uuid, cnt bigint, net numeric, earliest date)
    language sql stable security definer
    set search_path to ''
    as $$
  select e.account_id,
         count(*)::bigint,
         coalesce(sum(case when e.direction = 'in' then e.amount else -e.amount end), 0)::numeric,
         min(e.entry_date)
    from public.cash_entries e
    join public.cash_accounts a on a.id = e.account_id
   where e.entry_date < a.opening_date
     and not e.include_before_opening
     and (private.can('view_cash') or private.can('can_manage_cash'))
   group by e.account_id
$$;

grant all on function public.cash_cutoff_summary() to authenticated;

comment on function public.cash_cutoff_summary() is
  'Операции, отсечённые датой начального остатка своего счёта (в журнале есть, в оборотах нет), по ВСЕМУ счёту без учёта выбранного периода: число, чистая сумма и самая ранняя дата. Питает предупреждение кассы и подтверждение переноса даты остатка. Право view_cash ИЛИ can_manage_cash внутри DEFINER. 2026-08-04 (0020).';
