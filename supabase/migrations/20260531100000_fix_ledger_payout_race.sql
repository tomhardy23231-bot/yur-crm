-- Юр CRM — Гонка «отметка выплаты + платёж клиента» завышает леджер (C1, критично).
--
-- Симптом (дело 006, иск 10%, оплачено 40 000 → юристу положено 4 000):
--   в леджере оказывалось paid 3 000 + accrued 4 000 = 7 000 (лишние +3 000).
--   Эксперт по тому же делу (без гонки) — корректно accrued 4 000.
--
-- Корень. private.upsert_ledger_entry уже считает остаток неттингом
--   v_rem = target − Σ(paid). НО сумму Σ(paid) он читает обычным SELECT, без
--   блокировки строк леджера. Параллельно идут ДВЕ независимые транзакции:
--     A) markLedgerPaidAction — прямой UPDATE одной accrued-строки в status='paid';
--     B) платёж клиента — INSERT в payments → триггер recalc_case_totals меняет
--        cases.paid_total → AFTER-триггер cases_sync_ledger → sync_case_ledger →
--        upsert_ledger_entry.
--   В READ COMMITTED оператор SELECT внутри B берёт снапшот на момент СВОЕГО
--   старта. Если A ещё не закоммитилась, B видит строку как 'accrued' и Σ(paid)=0,
--   значит v_rem = target (а не target − уже_выплачено). Дальше B пытается
--   обновить accrued-строку, но A её к тому времени уже перевела в 'paid' и
--   закоммитила → UPDATE B по `status='accrued'` находит 0 строк → B ВСТАВЛЯЕТ
--   новую accrued на полный target. Итог: paid (от A) + accrued=target (от B) =
--   двойной счёт.
--
-- Фикс. В начале upsert_ledger_entry берём `FOR UPDATE` на все строки леджера
--   роли×дела. Это сериализует пересчёт с параллельной отметкой выплаты/откатом
--   (они тоже блокируют ту же строку): B дожидается коммита A и ПЕРЕЧИТЫВАЕТ
--   свежий Σ(paid). Тогда остаток считается от актуально выплаченного в любом
--   порядке операций — инвариант «accrued = target − выплачено» держится всегда.
--
-- Почему без дедлоков: платёж B держит блокировки в порядке cases-строка
--   (recalc UPDATE) → ledger-строки (этот FOR UPDATE); отметка выплаты A берёт
--   только ledger-строку и cases не трогает; два параллельных платежа уже
--   сериализованы блокировкой cases-строки в recalc. Цикла ожиданий нет.
--
-- Правило базы зарплаты НЕ меняется: база = фактически оплаченная сумма с
--   переплатой (решение владельца). Здесь чинится ТОЛЬКО гонка/задвоение.

create or replace function private.upsert_ledger_entry(
  p_case_id uuid,
  p_user_id uuid,
  p_role    text,
  p_base    numeric,
  p_percent numeric,
  p_actor   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target numeric(14, 2);
  v_paid   numeric(14, 2);
  v_rem    numeric(14, 2);
  v_rows   integer;
begin
  v_target := round(p_base * p_percent / 100, 2);

  -- C1: сериализация с параллельной отметкой выплаты/откатом. FOR UPDATE на
  -- строки роли×дела заставляет дождаться их коммита и перечитать актуальный
  -- Σ(paid) — иначе под снапшотом READ COMMITTED можно прочитать устаревший
  -- paid=0 и вставить дубль-accrued на полный target (см. шапку миграции).
  -- Без status-фильтра: блокируем ВСЕ строки роли×дела (и accrued, и paid),
  -- чтобы поймать ту самую строку, которую отметка выплаты переводит в paid.
  perform 1
    from public.payroll_ledger
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
   for update;

  -- Сколько роли уже физически выплачено по этому делу (исторические paid).
  -- Читается ПОСЛЕ FOR UPDATE → видит свежий коммит параллельной выплаты.
  select coalesce(sum(amount), 0)
    into v_paid
    from public.payroll_ledger
   where case_id = p_case_id
     and user_id = p_user_id
     and role_in_case = p_role
     and status = 'paid';

  v_rem := v_target - v_paid;

  if v_rem > 0 then
    -- Обновляем единственную accrued-строку под актуальный остаток…
    update public.payroll_ledger
       set base_amount = p_base,
           percent     = p_percent,
           amount      = v_rem
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
    get diagnostics v_rows = row_count;

    -- …или создаём новую (первое начисление либо доплата после выплаты).
    if v_rows = 0 then
      insert into public.payroll_ledger
        (case_id, user_id, role_in_case, base_amount, percent, amount, created_by)
      values
        (p_case_id, p_user_id, p_role, p_base, p_percent, v_rem, p_actor);
    end if;
  else
    -- Остатка нет (всё выплачено или ставку понизили) — accrued не нужен.
    delete from public.payroll_ledger
     where case_id = p_case_id
       and user_id = p_user_id
       and role_in_case = p_role
       and status = 'accrued';
  end if;
end;
$$;

comment on function private.upsert_ledger_entry(uuid, uuid, text, numeric, numeric, uuid) is
  'Приводит accrued-остаток роли×дела к target − Σ(paid). C1: FOR UPDATE на строки '
  'роли×дела сериализует пересчёт с параллельной отметкой выплаты/откатом '
  '(защита от задвоения paid+accrued под READ COMMITTED). Задача 1/P1.3.';
