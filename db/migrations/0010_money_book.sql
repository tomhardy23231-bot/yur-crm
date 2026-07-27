-- ============================================================================
-- 0010_money_book.sql — «Книга операцій»: расход перестаёт быть привязанным к
-- делу, зарплатная выплата сама становится расходом.
--
-- ЗАЧЕМ. Миграция 0009 сделала расходы ТОЛЬКО по делу (case_id not null). Разбор
-- присланной клиентом оборотки (ОЛІМП, травень 2026) показал, что это узко:
-- за месяц 18 расходов на 188 682 ₴, и почти все — общефирменные:
--   єдиний податок 41 696 · реклама 38 950 · Козлитин Д.С 30 000 ·
--   оренда 21 899 · зарплата + податки з неї 20 863 · військовий збір 8 339 ·
--   зв'язок (Київстар/Бінотел/ВФ/Укртелеком) 9 752 · вода в офіс 294 · бухпрограма.
-- Ни одна из этих строк к делу не относится. Формулировка клиента (26.07.2026):
-- «нужно, чтобы понимать куда сколько пришло, и откуда сколько и куда ушло».
--
-- ЧТО МЕНЯЕТСЯ.
--   • public.case_expenses → public.expenses; case_id СТАНОВИТСЯ необязательным:
--     расход по делу (судовий збір) и расход фирмы (оренда, вода) — одна сущность
--     с общей статьёй и общим зеркалом в кассу;
--   • method (счёт списания) допускает NULL — «счёт по умолчанию»;
--   • выплата зарплаты (payroll_transactions.kind='payout') автоматически
--     создаёт расход по статье «Зарплата» → тот попадает в кассу. Иначе зарплату
--     пришлось бы вносить дважды и цифры разошлись бы (та же болезнь, что была
--     с платежами-«витратами»).
--
-- ГЛАВНЫЙ ИНВАРИАНТ 0009 СОХРАНЁН. Расходы по-прежнему в ОТДЕЛЬНОЙ от payments
-- таблице; ни одно выражение SUM(payments.amount) / cases.paid_total не тронуто →
-- база ЗП измениться не может. Зарплатный расход пишется с case_id = NULL и в
-- маржу дела не входит.
--
-- ДОСТУП (осознанное разделение).
--   • строка С делом      — как в 0009: view/manage_case_expenses × видимость дела;
--   • строка БЕЗ дела     — права КАССЫ (view_cash / can_manage_cash).
-- Так сделано намеренно: среди общефирменных расходов есть зарплата, и её суммы
-- не должны открываться всем, у кого стоит галочка «расходы по делу».
--
-- Зеркала в TS (та же правка): prisma/schema.prisma (модель expenses),
-- src/lib/types/db.ts, src/lib/expenses/*.
-- ============================================================================

-- ── 1. Таблица: переименование и «дело необязательно» ────────────────────────
-- Имена индексов и констрейнтов остаются прежними (case_expenses_*): их не
-- использует ни код, ни Prisma, а переименование ради красоты добавило бы риск.
alter table public.case_expenses rename to expenses;

alter table public.expenses alter column case_id drop not null;

-- NULL = «счёт по умолчанию»: private.cash_kind_for_method(null) → null →
-- cash_resolve_account падает в фолбэк на счёт с is_default. Нужно для
-- авто-расхода зарплаты, где счёт списания системе неизвестен.
alter table public.expenses alter column method drop not null;

comment on table public.expenses is
  'Расходы фирмы. case_id NOT NULL — трата по делу (судовий збір, експертиза), она уменьшает маржу дела; case_id NULL — общефирменный расход (оренда, податки, зв''язок, зарплата, вода). НЕ влияет на ЗП: база ЗП = cases.paid_total = SUM(payments.amount), эта таблица в расчёт зарплаты не входит нигде. Зеркалится в кассу расходом (private.cash_sync_on_expense). UPDATE-политики нет: правка = удалить и внести заново. v2026-07-26 (0010, было case_expenses из 0009).';

comment on column public.expenses.case_id is
  'Дело, к которому относится трата. NULL = расход фирмы вне дел (оренда, податки, зарплата) — в маржу дел не входит. 2026-07-26.';

comment on column public.expenses.method is
  'Код счёта списания: card | bank | cash. NULL = счёт по умолчанию (фолбэк cash_resolve_account). 2026-07-26.';

-- ── 2. Связь с выплатой зарплаты ─────────────────────────────────────────────
-- Системная колонка-связка (зеркало payment_id/expense_id в кассе): такие строки
-- пользователю на запись и удаление не отдаются — они живут вместе с выплатой.
alter table public.expenses add column payroll_transaction_id uuid;

alter table only public.expenses
    add constraint expenses_payroll_transaction_id_fkey foreign key (payroll_transaction_id)
        references public.payroll_transactions(id) on delete cascade;

create unique index expenses_payroll_transaction_uniq
    on public.expenses using btree (payroll_transaction_id)
    where (payroll_transaction_id is not null);

comment on column public.expenses.payroll_transaction_id is
  'Выплата зарплаты, породившая этот расход (авто). NOT NULL = системная строка: руками не вносится и не удаляется, снимается вместе с выплатой каскадом. 2026-07-26.';

-- ── 3. Доступ ────────────────────────────────────────────────────────────────
drop policy case_expenses_select_via_case on public.expenses;
drop policy case_expenses_insert_via_case on public.expenses;
drop policy case_expenses_delete_author_or_managers on public.expenses;

-- Видимость: расход дела — по видимости дела и праву расходов; расход фирмы —
-- по правам кассы (там же лежит зарплата).
create policy expenses_select on public.expenses
    for select to authenticated
    using (
      case when case_id is null
        then private.can('view_cash'::text) or private.can('can_manage_cash'::text)
        else private.can_see_case(case_id) and private.can('view_case_expenses'::text)
      end
    );

-- Внесение: автор проставлен, системные (зарплатные) строки руками не создаются.
create policy expenses_insert on public.expenses
    for insert to authenticated
    with check (
      created_by = (select private.active_uid())
      and payroll_transaction_id is null
      and (
        case when case_id is null
          then private.can('can_manage_cash'::text)
          else private.can_write_case(case_id) and private.can('manage_case_expenses'::text)
        end
      )
    );

-- Удаление: расход дела — автор или staff-управленцы; расход фирмы — менеджер
-- кассы. Зарплатные строки снимаются только вместе с самой выплатой.
create policy expenses_delete on public.expenses
    for delete to authenticated
    using (
      payroll_transaction_id is null
      and (
        case when case_id is null
          then private.can('can_manage_cash'::text)
          else private.can('manage_case_expenses'::text)
               and (created_by = (select private.active_uid()) or private.can_manage_users())
        end
      )
    );

-- ── 4. Статьи из реальной оборотки клиента ───────────────────────────────────
-- Встроенные статьи 0009: court_fee, state_duty, expertise, travel, rent,
-- advertising, taxes, bank_fees, other. По файлу ОЛІМП не хватало трёх.
-- Лейблы встроенных берутся из i18n enums.expenseCategory (name — фолбэк).
insert into public.expense_categories (code, name, is_builtin, sort_order) values
  ('salary',        'Зарплата',          true, 55),
  ('communication', 'Зв''язок',          true, 56),
  ('office',        'Офіс і господарче', true, 57)
on conflict (code) do nothing;

-- ── 5. Зеркало расхода в кассу — учитывает расход без дела ───────────────────
-- Отличия от версии 0009: номер дела в описании добавляется, только если дело
-- указано; резолв счёта работает и при method IS NULL (счёт по умолчанию).
create or replace function private.cash_sync_on_expense() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_cat     text;
  v_desc    text;
begin
  -- Счёт резолвим ПЕРВЫМ: на UPDATE не сносим прежнюю строку, если новую
  -- положить некуда — иначе молчаливая потеря расхода из оборотки.
  v_account := private.cash_resolve_account(new.method);
  if v_account is null then
    -- Касс нет вовсе. Расход всё равно сохраняется (триггер не падает).
    return null;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.cash_entries where expense_id = new.id;
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
    (account_id, entry_date, direction, amount, description, case_id, expense_id, created_by)
  values
    (v_account, new.spent_at, 'out', new.amount, left(v_desc, 300), new.case_id, new.id, new.created_by);

  return null;
end;
$$;

comment on function private.cash_sync_on_expense() is
  'Зеркалит расход (public.expenses) в кассу строкой Розхід. Дело в описании — только если указано. method NULL → счёт по умолчанию. Нет счетов → расход сохраняется, но в оборотку не попадает. 2026-07-26 (0010).';

-- ── 6. Выплата зарплаты → расход фирмы ───────────────────────────────────────
-- Решение владельца 2026-07-26: «зарплата сама падает в кассу, иначе цифры в
-- кассе и в зарплате будут жить отдельно». Премия (kind='bonus') — это
-- НАЧИСЛЕНИЕ, деньги по ней уходят отдельной выплатой, поэтому в кассу не идёт.
create function private.expense_sync_on_payout() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_cat  uuid;
  v_name text;
begin
  if new.kind <> 'payout' then
    return null;
  end if;

  select id into v_cat from public.expense_categories where code = 'salary';
  if v_cat is null then
    -- Статья «Зарплата» скрыта/удалена — выплату не блокируем.
    return null;
  end if;

  select full_name into v_name from public.users where id = new.user_id;

  insert into public.expenses
    (case_id, category_id, amount, spent_at, method, note, created_by, payroll_transaction_id)
  values
    (null, v_cat, new.amount, new.occurred_on, null,
     left(coalesce(v_name, '') || coalesce(' · ' || nullif(btrim(new.comment), ''), ''), 500),
     new.created_by, new.id);

  return null;
end;
$$;

create trigger expense_sync_on_payout
    after insert on public.payroll_transactions
    for each row execute function private.expense_sync_on_payout();

comment on function private.expense_sync_on_payout() is
  'Выплата ЗП (payroll_transactions.kind=payout) → расход фирмы по статье «Зарплата» (case_id NULL) → и дальше в кассу через cash_sync_on_expense. Премии не зеркалит: bonus — начисление, а не движение денег. Удаление выплаты снимает расход каскадом. 2026-07-26 (0010).';

-- ── 7. Отчёт прибыльности — пересоздать после переименования таблицы ─────────
-- Тело функции хранится текстом: rename таблицы его НЕ обновляет, старая
-- finance_by_case упала бы на несуществующей case_expenses.
create or replace function public.finance_by_case(p_from date default null::date, p_to date default null::date)
    returns table(
      case_id uuid,
      number_title text,
      client_name text,
      lawyer_id uuid,
      responsible_id uuid,
      income numeric,
      expense numeric,
      margin numeric
    )
    language sql stable
    set search_path to ''
    as $$
  with inc as (
    select p.case_id, sum(p.amount) as income
      from public.payments p
     where (p_from is null or p.paid_at >= p_from)
       and (p_to   is null or p.paid_at <= p_to)
     group by p.case_id
  ),
  spent as (
    select e.case_id, sum(e.amount) as expense
      from public.expenses e
     where e.case_id is not null
       and (p_from is null or e.spent_at >= p_from)
       and (p_to   is null or e.spent_at <= p_to)
     group by e.case_id
  )
  select
    c.id,
    c.number_title,
    cl.name,
    c.lawyer_id,
    c.responsible_id,
    coalesce(inc.income, 0)::numeric,
    coalesce(spent.expense, 0)::numeric,
    (coalesce(inc.income, 0) - coalesce(spent.expense, 0))::numeric
  from public.cases c
  left join public.clients cl on cl.id = c.client_id
  left join inc on inc.case_id = c.id
  left join spent on spent.case_id = c.id
  where inc.income is not null or spent.expense is not null
$$;

comment on function public.finance_by_case(p_from date, p_to date) is
  'Прибыльность по делам за период: income (SUM payments.amount), expense (SUM expenses.amount по делу), margin = income - expense. Общефирменные расходы (case_id NULL) сюда НЕ входят. SECURITY INVOKER → RLS режет строки сама. 2026-07-26 (0010).';

-- ── 8. Расходы по статьям за период (новый отчёт «куда ушло») ────────────────
-- SECURITY INVOKER: RLS сама решает, какие строки видны зрителю (расходы дел —
-- по видимости дела, общефирменные — по правам кассы).
create function public.expenses_by_category(p_from date default null::date, p_to date default null::date)
    returns table(
      category_id uuid,
      code text,
      name text,
      is_builtin boolean,
      total numeric,
      cnt bigint,
      case_total numeric,
      company_total numeric
    )
    language sql stable
    set search_path to ''
    as $$
  select
    c.id,
    c.code,
    c.name,
    c.is_builtin,
    coalesce(sum(e.amount), 0)::numeric,
    count(e.id),
    coalesce(sum(e.amount) filter (where e.case_id is not null), 0)::numeric,
    coalesce(sum(e.amount) filter (where e.case_id is null), 0)::numeric
  from public.expense_categories c
  join public.expenses e on e.category_id = c.id
   and (p_from is null or e.spent_at >= p_from)
   and (p_to   is null or e.spent_at <= p_to)
  group by c.id, c.code, c.name, c.is_builtin, c.sort_order
  having coalesce(sum(e.amount), 0) <> 0
  order by coalesce(sum(e.amount), 0) desc
$$;

grant all on function public.expenses_by_category(p_from date, p_to date) to authenticated;

comment on function public.expenses_by_category(p_from date, p_to date) is
  'Расходы по статьям за период: total, из них по делам (case_total) и общефирменные (company_total). Ответ на вопрос клиента «куда сколько ушло». SECURITY INVOKER → RLS режет строки сама. 2026-07-26 (0010).';
