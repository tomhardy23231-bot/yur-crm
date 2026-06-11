-- Юр CRM — v3 Сессия 7 (Продукт), часть 4: конфликт-чек интересов (lite).
--
-- Зачем (PLAN-V3 7.4): проверка конфликта интересов / дубля клиента — отраслевой
-- стандарт, которого не было. При заведении клиента или указании оппонента
-- сверяем по ВСЕЙ базе и предупреждаем (НЕ блокируем).
--
-- SECURITY DEFINER — поиск обязан идти по всей базе (иначе чек бессмыслен: юрист не
-- видит чужих клиентов/дел, а конфликт именно там). Возвращаем МИНИМУМ (kind, label)
-- — только метаданные для предупреждения, без id и чувствительных полей. Доступ —
-- любой залогиненный (active_uid не NULL). Три ветки:
--   1) client   — совпадение с существующим клиентом (дедуп: ИНН / телефон / имя);
--   2) opponent — имя совпадает с оппонентом существующего дела (новый клиент —
--                 это чей-то процессуальный противник);
--   3) client   — имя совпадает с именем существующего клиента (label «Уже клиент» —
--                 ловит случай «оппонент нового дела уже наш доверитель» = конфликт).
-- limit 20 применяется к ОБЪЕДИНЕНИЮ (обёрнуто в подзапрос).

create or replace function public.conflict_check(p_name text default null,
                                                 p_inn text default null,
                                                 p_phone text default null)
returns table (kind text, label text)
language sql
security definer
set search_path = ''
as $$
  select q.kind, q.label from (
    -- 1) дубль клиента: ИНН / телефон / похожее имя
    select 'client'::text as kind,
           cl.name || coalesce(' · ІПН ' || cl.inn, '') as label
    from public.clients cl
    where private.active_uid() is not null
      and (
        (p_inn is not null and p_inn <> '' and cl.inn = p_inn)
        or (p_phone is not null and p_phone <> '' and cl.phone = p_phone)
        or (p_name is not null and char_length(p_name) >= 5 and cl.name ilike '%' || p_name || '%')
      )

    union all

    -- 2) имя совпадает с оппонентом существующего дела
    select 'opponent'::text as kind,
           'Оппонент в деле «' || c.number_title || '»' as label
    from public.cases c
    where private.active_uid() is not null
      and p_name is not null and char_length(p_name) >= 5
      and c.opponent is not null
      and c.opponent ilike '%' || p_name || '%'

    union all

    -- 3) имя совпадает с именем существующего клиента (оппонент = наш доверитель)
    select 'client'::text as kind,
           'Уже клиент: ' || cl.name as label
    from public.clients cl
    where private.active_uid() is not null
      and p_name is not null and char_length(p_name) >= 5
      and cl.name ilike '%' || p_name || '%'
  ) q
  limit 20;
$$;

grant execute on function public.conflict_check(text, text, text) to authenticated;

comment on function public.conflict_check(text, text, text) is
  'v3 s7: конфликт-чек/дедуп (lite). По всей базе (SECURITY DEFINER): клиент по '
  'ИНН/телефону/имени, имя среди оппонентов дел, имя среди клиентов («Уже клиент»). '
  'Возвращает только (kind, label). НЕ блокирует — UI показывает предупреждение.';
