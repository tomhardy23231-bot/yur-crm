-- Юр CRM — v2 Этап 5 (Акты), часть 1: реквизиты компании-исполнителя (ВИКОНАВЕЦЬ).
--
-- Печатная форма «Рахунок-Акт» (docs/samples/rahunok-akt-sample.xlsx) берёт шапку и
-- подвал исполнителя из этих реквизитов. Компания одна → single-row таблица
-- (id фиксирован = 1, CHECK + дефолт). Редактирует только owner (системная настройка,
-- как ставки ЗП), читают все активные сотрудники (нужно для генерации акта).
--
-- Поля разнесены (iban / bank_name / mfo, tax_status_lines[]), чтобы печатная форма
-- собирала строки «П/р {iban} в {bank_name} МФО {mfo}» и блок налогового статуса
-- 1:1 с образцом, а UI правил их по отдельности.
--
-- Миграция аддитивная (новая таблица). Сид — реквизиты ОЛІМП из образца клиента
-- (заполнены сразу, чтобы форма реквизитов и генерация акта работали из коробки;
-- owner переопределит при необходимости).

create table public.org_requisites (
  id               smallint primary key default 1,
  org_name         text not null default '',
  edrpou           text not null default '',
  address          text not null default '',
  phone            text not null default '',
  iban             text not null default '',
  bank_name        text not null default '',
  mfo              text not null default '',
  -- Строки налогового статуса (укр.): «Не є платником ПДВ», «Єдиний податок, 3 група».
  tax_status_lines text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id) on delete set null,

  constraint org_requisites_singleton check (id = 1)
);

comment on table public.org_requisites is
  'Реквизиты компании-исполнителя (ВИКОНАВЕЦЬ) для печатной формы Рахунок-Акт. '
  'Single-row (id=1). Правит только owner, читают все активные сотрудники.';

-- Сид: реквизиты из образца клиента (ОЛІМП). owner переопределит в /settings/requisites.
insert into public.org_requisites (
  id, org_name, edrpou, address, phone, iban, bank_name, mfo, tax_status_lines
) values (
  1,
  'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ЦЕНТР ЮРИДИЧНОГО ЗАХИСТУ "ОЛІМП"',
  '45679789',
  '49038, Дніпропетровська обл., місто Дніпро, пр.Яворницького Дмитра, будинок 111 А',
  '+380996667366',
  'UA053220010000026003700003989',
  'АТ "УНІВЕРСАЛ БАНК"',
  '322001',
  array['Не є платником ПДВ', 'Є платником єдиного податку, 3 група']
);

-- ========================================================================
-- RLS: SELECT — все активные authenticated; UPDATE — только owner.
-- INSERT/DELETE user-политик НЕТ (строка единственная, засеяна миграцией) →
-- добавить/удалить строку можно только через service_role (системно).
-- ========================================================================
alter table public.org_requisites enable row level security;

create policy org_requisites_select
  on public.org_requisites
  for select
  to authenticated
  using ((select private.active_uid()) is not null);

create policy org_requisites_update_owner
  on public.org_requisites
  for update
  to authenticated
  using      (private.is_owner())
  with check (private.is_owner());
