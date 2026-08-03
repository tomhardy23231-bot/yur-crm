-- ============================================================================
-- 0017_cash_reports.sql — SQL-фундамент отчётов кассы за ПРОИЗВОЛЬНЫЙ период.
--
-- ЗАЧЕМ (владелец, 2026-08-03): «нужны отчёты в кассе — и внутри программы,
-- и выгрузкой». Действующий /reports/cash умеет ровно один календарный месяц
-- и считает сальдо в TypeScript по выкачанным операциям (потолок 5000 строк).
-- Для квартала и года такая выкачка молча занижала бы цифры, поэтому обороты,
-- помесячное движение и разрезы дохода считаем в БД.
--
-- ── ГЛАВНОЕ РЕШЕНИЕ ЦИКЛА: два источника денег, и это НАМЕРЕННО ─────────────
-- Разбор данных 2026-08-03 показал: платежей по делам 652 на 6 762 450 ₴ за
-- все годы, а в кассе ОДНА операция — счёт «Моно» открыт 27.07.2026, и авто-
-- приход работает только с этого дня. Кнопка «Синхронізувати» это не лечит:
-- она заводит операции ДАТОЙ ПЛАТЕЖА, а всё, что раньше opening_date, из
-- расчётов выпадает (считается уже сидящим в начальном остатке счёта).
--
-- Владелец выбрал РАЗДЕЛИТЬ источники:
--   • «сколько заработали, от каких дел / клиентов / людей» → public.payments
--     (вся история; RLS режет по видимости дела — см. income_breakdown ниже);
--   • «сколько на счетах, что пришло и ушло» → public.cash_entries
--     (честно с даты открытия счёта; право view_cash / can_manage_cash).
-- Суммы этих двух групп отчётов НЕ ОБЯЗАНЫ совпадать, и UI это подписывает.
-- Альтернативы (залить историю в кассу задним числом) отклонены: расходов за
-- прошлые годы в кассе никто не вёл, вышло бы «пришло 6,76 млн, ушло 0».
--
-- ЧТО ДОБАВЛЯЕТСЯ (три функции; таблицы не меняются):
--   1. public.cash_turnover(from,to)      — обороты по счетам (касса);
--   2. public.cash_flow_monthly(from,to)  — приход/расход по месяцам (касса);
--   3. public.income_breakdown(from,to,dim) — «откуда пришли деньги»
--      в разрезе дела / клиента / юриста / Експерта / способа оплаты / счёта
--      (ПЛАТЕЖИ, не касса).
--
-- ⚠ ГРАНИЦА opening_date. Обе кассовые функции, как и cash_balances_before,
-- отбрасывают операции РАНЬШЕ даты открытия счёта — иначе деньги посчитались
-- бы дважды. Новые отчёты обязаны сходиться с существующей вкладкой сальдо,
-- которая делает ровно то же самое в TS (entriesFromOpening).
--
-- ⚠ НА ЗАРПЛАТУ НЕ ВЛИЯЕТ. База ЗП остаётся cases.paid_total (§7-4); все три
-- функции — только показ.
-- ============================================================================

-- Помесячная свёртка ходит по одной дате, а существующий индекс ведёт с
-- account_id — добавляем «чистый» индекс по дате.
create index if not exists cash_entries_entry_date_idx
    on public.cash_entries using btree (entry_date);

-- Разрезы дохода группируют платежи по дате — тот же довод.
create index if not exists payments_paid_at_idx
    on public.payments using btree (paid_at);

-- ── 1. Обороты по счетам за период (КАССА) ──────────────────────────────────
-- Сальдо на начало/конец страница берёт у cash_balances_before(from) и
-- cash_balances_before(to + 1 день) — отдельная функция для этого не нужна.
create or replace function public.cash_turnover(
    p_from date default null::date,
    p_to date default null::date
) returns table(account_id uuid, inflow numeric, outflow numeric, cnt bigint)
    language sql stable security definer
    set search_path to ''
    as $$
  select e.account_id,
         coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric,
         coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric,
         count(*)::bigint
    from public.cash_entries e
    join public.cash_accounts a on a.id = e.account_id
   where e.entry_date >= a.opening_date
     and (p_from is null or e.entry_date >= p_from)
     and (p_to   is null or e.entry_date <= p_to)
     and (private.can('view_cash') or private.can('can_manage_cash'))
   group by e.account_id
$$;

grant all on function public.cash_turnover(date, date) to authenticated;

comment on function public.cash_turnover(p_from date, p_to date) is
  'Обороты кассы по счетам за период: приход, расход, число операций. Операции раньше opening_date счёта исключены (уже в opening_balance). Право view_cash ИЛИ can_manage_cash внутри DEFINER. 2026-08-03 (0017).';

-- ── 2. Движение денег по месяцам (КАССА) ────────────────────────────────────
-- Строка на КАЖДЫЙ месяц, где были операции; пустые месяцы периода дорисовывает
-- клиент (иначе пришлось бы тащить сюда календарь и часовой пояс фирмы).
create or replace function public.cash_flow_monthly(
    p_from date default null::date,
    p_to date default null::date
) returns table(month date, inflow numeric, outflow numeric, cnt bigint)
    language sql stable security definer
    set search_path to ''
    as $$
  select date_trunc('month', e.entry_date)::date,
         coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric,
         coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric,
         count(*)::bigint
    from public.cash_entries e
    join public.cash_accounts a on a.id = e.account_id
   where e.entry_date >= a.opening_date
     and (p_from is null or e.entry_date >= p_from)
     and (p_to   is null or e.entry_date <= p_to)
     and (private.can('view_cash') or private.can('can_manage_cash'))
   group by 1
   order by 1
$$;

grant all on function public.cash_flow_monthly(date, date) to authenticated;

comment on function public.cash_flow_monthly(p_from date, p_to date) is
  'Приход/расход кассы по месяцам за период (месяц = первое число). Пустые месяцы не возвращаются — дорисовывает клиент. Право view_cash ИЛИ can_manage_cash внутри DEFINER. 2026-08-03 (0017).';

-- ── 3. «Откуда пришли деньги» — разрезы дохода (ПЛАТЕЖИ) ────────────────────
-- p_dim: case | client | lawyer | expert | method | account. Неизвестный → пусто.
--
-- SECURITY **INVOKER** — принципиально. Доход здесь считается по payments, а их
-- RLS-политика payments_select_via_case уже режет строки по видимости дела
-- (private.can_see_case). Значит отчёт скоупится сам: владелец видит фирму
-- целиком, руководитель — своё подразделение, юрист — свои дела. Никакого
-- обхода RLS и никакой служебной корзины «чужие дела» не нужно: невидимых
-- строк в выборке просто нет. Тот же приём, что у public.finance_by_case.
--
-- LEFT JOIN на cases/clients/users/cash_accounts — намеренно: если справочник
-- невидим зрителю (например, счета кассы закрыты правом), сумма всё равно
-- попадёт в отчёт, потеряется только подпись. INNER JOIN молча съел бы деньги.
--
-- bucket_key — стабильный ключ строки: id сущности, текст способа оплаты либо
-- служебная корзина ('unset' — способ не указан, 'no_account' — счёт не указан,
-- 'unknown' — справочник не отдал имя). Служебные корзины приходят с
-- bucket_label = NULL: подпись даёт i18n, чтобы не хардкодить язык в БД.
create or replace function public.income_breakdown(
    p_from date default null::date,
    p_to date default null::date,
    p_dim text default 'case'
) returns table(
      bucket_key text,
      bucket_label text,
      ref_id uuid,
      total numeric,
      cnt bigint
    )
    language plpgsql stable
    set search_path to ''
    as $$
begin
  if p_dim = 'case' then
    return query
      select p.case_id::text, max(c.number_title), p.case_id,
             sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
        left join public.cases c on c.id = p.case_id
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by p.case_id
       order by 4 desc;

  elsif p_dim = 'client' then
    return query
      select coalesce(c.client_id::text, 'unknown'), max(cl.name), c.client_id,
             sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
        left join public.cases c on c.id = p.case_id
        left join public.clients cl on cl.id = c.client_id
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by c.client_id
       order by 4 desc;

  elsif p_dim = 'lawyer' then
    -- Юрист-продажник дела: «кто принёс деньги».
    return query
      select coalesce(c.lawyer_id::text, 'unknown'), max(u.full_name), c.lawyer_id,
             sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
        left join public.cases c on c.id = p.case_id
        left join public.users u on u.id = c.lawyer_id
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by c.lawyer_id
       order by 4 desc;

  elsif p_dim = 'expert' then
    -- Експерт-исполнитель дела: «по чьей работе платят».
    return query
      select coalesce(c.responsible_id::text, 'unknown'), max(u.full_name),
             c.responsible_id, sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
        left join public.cases c on c.id = p.case_id
        left join public.users u on u.id = c.responsible_id
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by c.responsible_id
       order by 4 desc;

  elsif p_dim = 'method' then
    -- Способ оплаты — свободный текст на платеже; на проде у большинства пуст
    -- (362 из 663 на момент 0016), такие уходят в корзину 'unset'.
    return query
      select coalesce(lower(nullif(btrim(p.method), '')), 'unset'),
             max(nullif(btrim(p.method), '')), null::uuid,
             sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by 1
       order by 4 desc;

  elsif p_dim = 'account' then
    -- Конкретный счёт зачисления (0016). У старых платежей пуст → 'no_account'.
    return query
      select coalesce(p.account_id::text, 'no_account'), max(a.name), p.account_id,
             sum(p.amount)::numeric, count(*)::bigint
        from public.payments p
        left join public.cash_accounts a on a.id = p.account_id
       where (p_from is null or p.paid_at >= p_from)
         and (p_to   is null or p.paid_at <= p_to)
       group by p.account_id
       order by 4 desc;

  end if;
  -- Неизвестный p_dim — пустой результат (fail-closed).
end;
$$;

grant all on function public.income_breakdown(date, date, text) to authenticated;

comment on function public.income_breakdown(p_from date, p_to date, p_dim text) is
  'Доход (payments) за период в разрезе case|client|lawyer|expert|method|account. SECURITY INVOKER → RLS payments_select_via_case скоупит строки по видимости дела. Служебные корзины: unset (способ не указан), no_account (счёт не указан), unknown (справочник не отдал имя) — подпись даёт i18n. НЕ касса: суммы с cash_turnover совпадать не обязаны, см. шапку миграции. 2026-08-03 (0017).';
