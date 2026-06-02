-- Юр CRM — расширение карточки клиента (по запросу заказчика).
--
-- Карточка физлица/ФОП должна хранить ФИО раздельно, дату рождения, ИНН и номер
-- договора. Раньше было только единое поле `name`. Добавляем:
--   last_name / first_name / middle_name — Фамилия / Имя / Отчество (для физлиц/ФОП);
--   birth_date  — дата рождения;
--   inn         — ИНН (для ФОП/компаний фактически ЕДРПОУ — храним как текст);
--   contract_number — номер договора (быстрый ввод; договор=дело остаётся в cases).
--
-- Все колонки NULLABLE: существующие строки и клиенты-компании (у них нет ФИО)
-- не должны ломаться. Поле `name` остаётся NOT NULL и служит отображаемым именем:
--   - физлицо/ФОП → собирается из ФИО на стороне экшена ("Фамилия Имя Отчество");
--   - компания    → это «Наименование».
-- RLS не меняется — новые колонки наследуют политики таблицы clients.

alter table public.clients
  add column if not exists last_name       text,
  add column if not exists first_name      text,
  add column if not exists middle_name     text,
  add column if not exists birth_date      date,
  add column if not exists inn             text,
  add column if not exists contract_number text;

comment on column public.clients.last_name       is 'Фамилия (физлицо/ФОП)';
comment on column public.clients.first_name      is 'Имя (физлицо/ФОП)';
comment on column public.clients.middle_name     is 'Отчество (физлицо/ФОП)';
comment on column public.clients.birth_date      is 'Дата рождения';
comment on column public.clients.inn             is 'ИНН (ЕДРПОУ для ФОП/компаний), только цифры';
comment on column public.clients.contract_number is 'Номер договора (быстрый ввод; договор=дело — в cases)';
