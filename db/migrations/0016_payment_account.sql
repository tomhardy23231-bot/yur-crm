-- ============================================================================
-- 0016_payment_account.sql — платёж по делу указывает КОНКРЕТНЫЙ счёт, и список
-- счетов виден всем, кто вносит деньги.
--
-- ЗАЧЕМ (владелец, 2026-07-27): «я провожу платёж в деле — почему там нет
-- списка, на какой счёт он упадёт? Это же логично, что должно так быть».
--
-- Как было: payments.method — СВОБОДНЫЙ ТЕКСТ («готівка», «безготівка», пусто).
-- Счёт для авто-прихода система угадывала по этому тексту, а не по выбору
-- человека. На проде 362 платежа из 663 вообще без способа — все они уезжали
-- на счёт по умолчанию. Отсюда же и «Синхронізувати → додано 0».
--
-- ЧТО МЕНЯЕТСЯ.
--   1. payments.account_id → public.cash_accounts. Задан — приход ложится
--      именно туда; не задан — прежнее угадывание по method (старые записи).
--   2. public.cash_accounts_pick() — список счетов для ФОРМ: id, название, вид.
--      Без остатков и дат. Доступен любому активному сотруднику, потому что
--      платёж вносит юрист, а права кассы (view_cash/can_manage_cash) выдаёт
--      только владелец. Балансы и обороты по-прежнему живут под правами кассы:
--      сама таблица cash_accounts остаётся закрытой RLS-политикой.
--
-- ON DELETE RESTRICT: счёт, на который уже приходили деньги, не удалить —
-- иначе приход повис бы «ниоткуда». В UI это объясняется и предлагается
-- сделать счёт неактивным.
-- ============================================================================

alter table public.payments add column account_id uuid;

alter table only public.payments
    add constraint payments_account_id_fkey foreign key (account_id)
        references public.cash_accounts(id) on delete restrict;

create index payments_account_id_idx on public.payments using btree (account_id);

comment on column public.payments.account_id is
  'Счёт кассы, на который пришли деньги. NULL — счёт подбирается по method (старые записи и платежи от актов). 2026-07-27 (0016).';

-- ── Авто-приход: явный счёт важнее угадывания по тексту ──────────────────────
create or replace function private.cash_sync_on_payment() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_account uuid;
  v_title   text;
  v_desc    text;
begin
  -- РЕЗОЛВИМ счёт ПЕРВЫМ — и только потом трогаем cash_entries. Иначе на UPDATE,
  -- если платёж отредактировали в метод без счёта, мы бы удалили прежнюю
  -- авто-строку и НЕ создали новую → молчаливая потеря прихода.
  -- 0016: сначала явно выбранный счёт, и лишь потом подбор по method.
  v_account := coalesce(new.account_id, private.cash_resolve_account(new.method));
  if v_account is null then
    -- Касс нет / метод не лёг ни на один счёт. INSERT — тихо пропускаем (платёж
    -- проходит, триггер не падает). UPDATE — НЕ удаляем прежнюю строку.
    return null;
  end if;

  -- Счёт известен. На UPDATE пересоздаём строку (сумма/дата/счёт могли смениться).
  if tg_op = 'UPDATE' then
    delete from public.cash_entries where payment_id = new.id;
  end if;

  select number_title into v_title from public.cases where id = new.case_id;
  v_desc := coalesce(
    nullif(btrim(new.note), ''),
    'Оплата по справі' || coalesce(': ' || v_title, '')
  );

  insert into public.cash_entries
    (account_id, entry_date, direction, amount, description, case_id, payment_id, created_by)
  values
    (v_account, new.paid_at, 'in', new.amount, left(v_desc, 300), new.case_id, new.id, new.created_by);

  return null;
end;
$$;

comment on function private.cash_sync_on_payment() is
  'Зеркалит платёж по делу в кассу приходом. Счёт: payments.account_id, иначе подбор cash_resolve_account(method). Нет счетов → платёж проходит, но в оборотку не попадает. 2026-07-27 (0016).';

-- ── Список счетов для форм (без денег) ───────────────────────────────────────
-- SECURITY DEFINER: сама таблица cash_accounts закрыта правами кассы, а форма
-- платежа/расхода нужна юристу и Експерту. Отдаём ТОЛЬКО справочные поля —
-- остатки, начальные суммы и даты сюда не попадают.
create function public.cash_accounts_pick()
    returns table(id uuid, name text, kind text, is_default boolean)
    language sql stable security definer
    set search_path to ''
    as $$
  select a.id, a.name, a.kind, a.is_default
    from public.cash_accounts a
   where a.is_active
     and private.active_uid() is not null
   order by a.is_default desc, a.created_at asc
$$;

grant all on function public.cash_accounts_pick() to authenticated;

comment on function public.cash_accounts_pick() is
  'Активные счета кассы для выпадающих списков форм (платёж, расход): id, название, вид, признак «по умолчанию». БЕЗ остатков и дат — деньги остаются под правами кассы. Доступен любому активному сотруднику. 2026-07-27 (0016).';
