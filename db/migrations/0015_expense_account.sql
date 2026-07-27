-- ============================================================================
-- 0015_expense_account.sql — расход списывается с КОНКРЕТНОГО счёта, а не с
-- «вида счёта».
--
-- ЗАЧЕМ (владелец, 2026-07-26): «счета могут по-разному называться, и карт
-- может быть много — нужно указывать, с какой именно списано, а тут только
-- 3 названия». До этой миграции у расхода хранился код ВИДА счёта
-- (card | bank | cash), и триггер сам выбирал первый подходящий счёт. При двух
-- картах («Моно», «ПриватБанк») выбрать нужную было невозможно.
--
-- ЧТО МЕНЯЕТСЯ. У расхода появляется account_id → public.cash_accounts.
--   • задан      — деньги списываются именно с этого счёта;
--   • не задан   — прежнее поведение: счёт подбирается по method
--                  (private.cash_resolve_account), в т. ч. для авто-расхода
--                  зарплаты, где счёт системе неизвестен.
-- Поле method сохраняется: его по-прежнему используют формы, где у вносящего
-- нет прав кассы и списка счетов он не видит (юрист вносит трату по делу).
--
-- ON DELETE RESTRICT: счёт, с которого уже списывали, не удалить — иначе
-- расход остался бы «ниоткуда». В UI это объясняется и предлагается скрыть счёт.
-- ============================================================================

alter table public.expenses add column account_id uuid;

alter table only public.expenses
    add constraint expenses_account_id_fkey foreign key (account_id)
        references public.cash_accounts(id) on delete restrict;

create index expenses_account_id_idx on public.expenses using btree (account_id);

comment on column public.expenses.account_id is
  'Счёт кассы, с которого списан расход. NULL — счёт подбирается по method (вид счёта) или по умолчанию. 2026-07-26 (0015).';

-- Зеркало в кассу: явный счёт имеет приоритет над подбором по виду.
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
  -- 1) Явно выбранный счёт; 2) подбор по виду/по умолчанию (старое поведение).
  -- Счёт резолвим ПЕРВЫМ: на UPDATE не сносим прежнюю строку, если новую
  -- положить некуда — иначе молчаливая потеря расхода из оборотки.
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));
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
  'Зеркалит расход (public.expenses) в кассу строкой Розхід. Счёт: expenses.account_id, иначе подбор cash_resolve_account(method). Дело в описании — только если указано. Нет счетов → расход сохраняется, но в оборотку не попадает. 2026-07-26 (0015).';
