-- Юр CRM — v3 Сессия 1 (БД-безопасность), задача 1.3.
--
-- Аудит: платёж, созданный подтверждением акта (payments.act_id IS NOT NULL),
-- можно было отредактировать (UPDATE amount/paid_at) через право edit_payments —
-- сумма платежа рассинхронизировалась бы с confirmed_amount/completion акта
-- (источник правды completion — оплаченные акты), а unique-индекс payments_act_id_uniq
-- этого не ловит (он про вставку, не про правку). Откат акта в issued завязан на
-- УДАЛЕНИЕ платежа (триггер case_acts_revert_on_payment_delete), а не на правку.
--
-- Решение: act-связанный платёж неизменяем по финансово значимым полям. Чтобы
-- скорректировать — удалить платёж (акт вернётся в issued) и подтвердить заново.
-- method/note оставляем редактируемыми намеренно (на act/completion не влияют).
-- Миграция аддитивная (новый триггер).

create or replace function private.payments_guard_act_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.act_id is not null and (
       new.amount  is distinct from old.amount
    or new.paid_at is distinct from old.paid_at
    or new.case_id is distinct from old.case_id
    or new.act_id  is distinct from old.act_id
  ) then
    raise exception 'act-linked payment is immutable; delete it to revert the act'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_act_payment on public.payments;
create trigger payments_guard_act_payment
  before update on public.payments
  for each row
  execute function private.payments_guard_act_payment();

comment on function private.payments_guard_act_payment() is
  'v3 s1: платёж с act_id неизменяем по amount/paid_at/case_id/act_id '
  '(правка рассинхронизировала бы акт/completion). method/note редактируемы.';
